import { describe, expect, it } from "vitest";
import type { ItemPropuesto } from "@/ai/esquema";
import { anclarPropuesta } from "./anclaje";
import { corregirItems } from "./correcciones";
import { alertaNotaIa, type CatalogoMapeo, mapearConDudasIa } from "./mapear";

const puerta = (p: Partial<ItemPropuesto>): ItemPropuesto => ({
  texto_fuente: "3 Neltume raulí 90x210", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [], ...p,
});
const marco = (p: Partial<ItemPropuesto>): ItemPropuesto => ({ ...puerta({ modelo: null, ancho_m: null }), tipo: "marco", ...p });
const corregir = (it: ItemPropuesto, mensaje = it.texto_fuente) => corregirItems([it], mensaje);

describe("corrección determinista acotada (ADR-0013 A)", () => {
  it("una sola madera en la línea corrige la que leyó la IA, con aviso", () => {
    const r = corregir(puerta({ madera: "LENGA" }));
    expect(r.items[0].madera).toBe("RAULI");
    expect(r.avisos).toEqual(["Ítem 1: corregí la madera a «Raulí», como dice su línea."]);
  });

  it("una sola cantidad, un solo par de medidas o una sola escuadría corrigen lo leído", () => {
    expect(corregir(puerta({ texto_fuente: "media docena de Neltume raulí 90x210", cantidad: 1 })).items[0].cantidad).toBe(6);
    const mm = corregir(puerta({ texto_fuente: "1 Neltume raulí 1230 x 2600 mm", cantidad: 1, ancho_m: 12.3, alto_m: 26 }));
    expect(mm.items[0]).toMatchObject({ ancho_m: 1.23, alto_m: 2.6 });
    expect(mm.avisos).toEqual(["Ítem 1: corregí la medida a «1,23 × 2,6 m», como dice su línea."]);
    // El menor es el ancho aunque se escriba primero el alto.
    expect(corregir(puerta({ texto_fuente: "3 Neltume raulí 210x90", ancho_m: 2.1, alto_m: 0.9 })).items[0]).toMatchObject({ ancho_m: 0.9, alto_m: 2.1 });
    expect(corregir(marco({ texto_fuente: "5 marcos 2x5 raulí de 2,10", cantidad: 5, alto_m: 2.1, medida_accesorio: "30x70" })).items[0].medida_accesorio).toBe("2x5");
    expect(corregir(marco({ texto_fuente: "5 marcos de 6 pulgadas raulí de 2,10", cantidad: 5, alto_m: 2.1, medida_accesorio: "2x4" })).items[0].medida_accesorio).toBe("2x6");
  });

  it("no corrige lo que coincide, ni con dos valores en la línea, ni lo que la IA dejó en null, ni una frase parafraseada", () => {
    expect(corregir(puerta({})).avisos).toEqual([]);
    expect(corregir(puerta({ texto_fuente: "3 Neltume raulí o lenga 90x210", madera: "MARA" })).items[0].madera).toBe("MARA");
    expect(corregir(puerta({ madera: null })).items[0].madera).toBeNull();
    expect(corregir(puerta({ cantidad: null })).items[0].cantidad).toBeNull();
    expect(corregirItems([puerta({ texto_fuente: "tres neltume en lenga", madera: "LENGA" })], "3 Neltume raulí 90x210").avisos).toEqual([]);
    // «pino radiata» no es oregón: lo que la IA copió tal cual se queda y sigue en duda en el mapeo.
    expect(corregir(puerta({ texto_fuente: "3 Neltume pino radiata 90x210", madera: "PINO RADIATA" })).items[0].madera).toBe("PINO RADIATA");
    expect(corregir(puerta({ texto_fuente: "3 Neltume pino radiata 90x210", madera: "LENGA" })).items[0].madera).toBe("LENGA");
  });

  it("anclarPropuesta corrige antes de anclar: lo corregido ya no queda en duda y el aviso va a las alertas", () => {
    const r = anclarPropuesta({ items: [puerta({ madera: "LENGA" })], alertas: [], sin_items: false }, "3 Neltume raulí 90x210", { modelos: ["NELTUME"], alias: [] });
    expect(r.propuesta.items[0]).toMatchObject({ madera: "RAULI", dudas: [] });
    expect(r.propuesta.alertas).toEqual(["Ítem 1: corregí la madera a «Raulí», como dice su línea."]);
  });
});

const cat: CatalogoMapeo = {
  modelos: [{ id: "nel", nombre: "NELTUME", codigo: "NEL" }], maderas: [{ id: "r", nombre: "RAULI", codigo: "R" }],
  rangos: [{ codigo: "4", etiqueta: "0,86 A 0,90", minM: 0.86, maxM: 0.9 }], altos: [{ codigo: "B", altoM: 2.1 }],
  articulos: new Map([["nel|r|4|B", { id: "a1", codigo: "NEL-R-4-B" }]]), alias: [], accesorios: [], piezas: [],
};

describe("dudas de la IA que no bloquean (ADR-0013 B)", () => {
  it("separa las dudas de la IA de las del sistema", () => {
    const r = anclarPropuesta({ items: [puerta({ dudas: ["ráuli se interpreta como RAULI"] })], alertas: [], sin_items: false }, "3 Neltume ráuli 90x210", { modelos: ["NELTUME"], alias: [] });
    expect(r.dudasIa).toEqual([["ráuli se interpreta como RAULI"]]);
    expect(r.propuesta.items[0].dudas).toEqual([]);
  });

  it("un ítem completo, anclado y del catálogo queda ok y la duda de la IA pasa a nota", () => {
    const r = mapearConDudasIa(puerta({}), ["La medida no está en la grilla, se acepta tal cual."], cat);
    expect(r.item).toMatchObject({ estado: "ok", codigo: "NEL-R-4-B" });
    expect(alertaNotaIa(1, r.nota!)).toBe("Ítem 1: la IA comentó «La medida no está en la grilla, se acepta tal cual.». No bloquea: el ítem coincide con el pedido y con el catálogo.");
  });

  it("si el ítem no se puede verificar, la duda de la IA bloquea como siempre, con su texto", () => {
    expect(mapearConDudasIa(puerta({ madera: null }), ["No se indica la madera"], cat)).toEqual({ item: expect.objectContaining({ estado: "por_confirmar", duda: "No se indica la madera" }), nota: null });
    // Una duda del anclaje (sistema) bloquea aunque la IA no haya escrito ninguna.
    expect(mapearConDudasIa(puerta({ dudas: ["La cantidad 3 no aparece en el pedido."] }), [], cat).item.estado).toBe("por_confirmar");
    expect(mapearConDudasIa({ ...puerta({}), tipo: "desconocido" }, ["chapa"], cat).item).toMatchObject({ estado: "por_confirmar", duda: "chapa" });
  });
});
