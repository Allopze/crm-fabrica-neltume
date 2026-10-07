import { describe, expect, it } from "vitest";
import type { ItemPropuesto } from "@/ai/esquema";
import { anclarItems, anclarPropuesta, cantidadPedidoEliptico, cantidadesDichas, cifras, NO_VERIFICADO, pedidosSinRegistrar } from "./anclaje";

const puerta = (p: Partial<ItemPropuesto>): ItemPropuesto => ({
  texto_fuente: "3 Neltume raulí 90x210", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [], ...p,
});
const MODELOS = ["NELTUME", "LICAN", "COZ COZ", "HUILO HUILO", "COSCOS"]; // modelos + alias
const NOMBRES = {
  modelos: ["NELTUME", "LICAN", "COZ COZ", "HUILO HUILO", "LANCO", "CHAUQUEN"],
  alias: [{ alias: "COSCOS", modelo: "COZ COZ", tipo: "seguro" }, { alias: "PILLO", modelo: "HUILO HUILO", tipo: "posible" }],
};

describe("verificación de cifras (REQ-COT-2.14)", () => {
  it("lee números y cantidades en palabras, sin confundir medidas con cantidades", () => {
    expect(cifras("90x210 y 2,10 m, 10.000")).toEqual(expect.arrayContaining([90, 210, 2.1, 10000]));
    expect(cantidadesDichas("3 Neltume raulí 90x210")).toEqual([3]);
    expect(cantidadesDichas("tres marcos de 2,10")).toEqual([3]);
    expect(cantidadesDichas("media docena de Lican")).toEqual([6]);
    expect(cantidadesDichas("un par de puertas de 80 por 200")).toEqual([2]);
    expect(cantidadesDichas("guardapolvo 12x1 de 3 m")).toEqual([]);
  });

  it("una cantidad que no está en su frase queda en duda; una dicha o heredada no", () => {
    const msj = "puertas Panguipulli lenga 80x210";
    expect(anclarItems([puerta({ texto_fuente: msj, cantidad: 1, ancho_m: 0.8, madera: "LENGA", modelo: "PANGUIPULLI" })], msj)[0].dudas).toEqual(["La cantidad 1 no aparece en el pedido."]);
    expect(anclarItems([puerta({})], "3 Neltume raulí 90x210")[0].dudas).toEqual([]);
    const conMarco = "2 Fuy oregón 70x200 con su marco 2x4 de 2,10";
    const items = anclarItems([
      puerta({ texto_fuente: "2 Fuy oregón 70x200", cantidad: 2, ancho_m: 0.7, alto_m: 2, madera: "PINO OREGON" }),
      { ...puerta({ texto_fuente: "con su marco 2x4 de 2,10", cantidad: 2, ancho_m: null, alto_m: 2.1, madera: "PINO OREGON" }), tipo: "marco", modelo: null, medida_accesorio: "2x4" },
    ], conMarco);
    expect(items.map((i) => i.dudas)).toEqual([[], []]);
  });

  it("una medida o escuadría inventada queda en duda; en cm o mm se reconoce", () => {
    expect(anclarItems([puerta({ alto_m: 2.2 })], "3 Neltume raulí 90x210")[0].dudas).toEqual(["El alto 2,2 m no aparece en el pedido."]);
    expect(anclarItems([puerta({ texto_fuente: "3 Neltume raulí 900 x 2100 mm" })], "3 Neltume raulí 900 x 2100 mm")[0].dudas).toEqual([]);
    const marco = { ...puerta({ texto_fuente: "3 marcos de raulí", ancho_m: null, alto_m: null }), tipo: "marco" as const, medida_accesorio: "2x6" };
    expect(anclarItems([marco], "3 marcos de raulí")[0].dudas).toEqual(["La medida «2x6» no aparece en el pedido."]);
  });

  it("el largo de un accesorio va en su línea (no hereda el alto de la puerta); el «2x» del marco es implícito", () => {
    const pedido = "2 Malalhue oregón 90x210 y 2 marcos de 4 pulgadas";
    const marco = { ...puerta({ texto_fuente: "2 marcos de 4 pulgadas", cantidad: 2, ancho_m: null, alto_m: 2.1, madera: null }), tipo: "marco" as const, medida_accesorio: "4 pulgadas" };
    expect(anclarItems([puerta({ texto_fuente: "2 Malalhue oregón 90x210", cantidad: 2 }), marco], pedido)[1].dudas).toEqual(["El largo 2,1 m es de otra línea del pedido."]);
    const deCuatro = { ...marco, texto_fuente: "6 marcos de 4 en raulí de 2,2", madera: "RAULI", cantidad: 6, alto_m: 2.2, medida_accesorio: "2x4" };
    expect(anclarItems([deCuatro], "6 marcos de 4 en raulí de 2,2")[0].dudas).toEqual([]);
  });

  it("«su marco» puede citarse sin «con» y hereda cantidad y alto de la puerta (REQ-COT-2.13)", () => {
    const texto = "9 Baker de raulí de 105x240 con su marco 2x8 en raulí";
    const items = [
      puerta({ texto_fuente: "9 Baker de raulí de 105x240", modelo: "BAKER", ancho_m: 1.05, alto_m: 2.4, cantidad: 9 }),
      { ...puerta({ texto_fuente: "su marco 2x8 en raulí", modelo: null, ancho_m: null, alto_m: 2.4, cantidad: 9 }), tipo: "marco" as const, medida_accesorio: "2x8" },
    ];
    expect(anclarItems(items, texto).map((i) => i.dudas)).toEqual([[], []]);
  });

  it("la madera sale de la línea o de lo dicho para todo el pedido, no de la línea de otro ítem", () => {
    const pedido = "2 Malalhue oregón 90x210 y 2 marcos de 4 pulgadas";
    const marco = { ...puerta({ texto_fuente: "2 marcos de 4 pulgadas", cantidad: 2, ancho_m: null, alto_m: null, madera: "PINO OREGON" }), tipo: "marco" as const, medida_accesorio: "4 pulgadas" };
    const sinFuente = (texto: string, items: ItemPropuesto[]) => anclarItems(items, texto).map((i) => i.dudas.filter((d) => /madera/.test(d)));
    expect(sinFuente(pedido, [puerta({ texto_fuente: "2 Malalhue oregón 90x210", cantidad: 2, madera: "PINO OREGON" }), marco])).toEqual([[], ["La madera «PINO OREGON» es de otra línea del pedido."]]);
    expect(sinFuente(`${pedido}, todo en oregón`, [puerta({ texto_fuente: "2 Malalhue oregón 90x210", cantidad: 2, madera: "PINO OREGON" }), marco])[1]).toEqual([]);
    expect(sinFuente("2 Fuy oregón 70x200 con su marco 2x4", [{ ...marco, texto_fuente: "con su marco 2x4", medida_accesorio: "2x4" }])[0]).toEqual([]);
    expect(sinFuente("3 Neltume raulí 90x210", [puerta({ madera: "LENGA" })])[0]).toEqual(["La línea dice otra madera que «LENGA»."]);
  });

  it("una madera que el pedido no nombra en ninguna parte queda en duda (la IA la completó)", () => {
    const yelcho = puerta({ texto_fuente: "4 puertas Yelcho 90x210", modelo: "YELCHO", cantidad: 4, madera: "PINO OREGON" });
    expect(anclarItems([yelcho], "4 puertas Yelcho 90x210")[0].dudas).toEqual(["La madera «PINO OREGON» no aparece en el pedido."]);
    // Aunque la IA parafrasee la frase, la madera debe estar en algún lugar del pedido.
    expect(anclarItems([{ ...yelcho, texto_fuente: "cuatro Yelcho" }], "4 puertas Yelcho 90x210")[0].dudas).toEqual([NO_VERIFICADO, "La madera «PINO OREGON» no aparece en el pedido."]);
    expect(anclarItems([{ ...yelcho, madera: "RAULI" }], "4 puertas Yelcho 90x210 en ráuli")[0].dudas).toEqual([]);
    expect(anclarItems([{ ...yelcho }], "4 puertas Yelcho 90x210 en pino")[0].dudas).toEqual([]);
  });

  it("si la frase no está tal cual en el pedido (parafraseada), el ítem queda por confirmar (ADR-0016)", () => {
    expect(anclarItems([puerta({ texto_fuente: "tres puertas neltume" })], "Necesito 3 Neltume raulí 90x210")[0].dudas).toEqual([NO_VERIFICADO]);
    // Casos de la auditoría H-04: modelo de otra línea y cantidad inventada con la frase parafraseada.
    expect(anclarItems([puerta({ texto_fuente: "puerta de raulí", cantidad: 1 })], "1 Lican raulí 90x210", NOMBRES)[0].dudas).toContain(NO_VERIFICADO);
    expect(anclarItems([puerta({ texto_fuente: "Neltume de raulí", cantidad: 7 })], "1 Neltume raulí 90x210", NOMBRES)[0].dudas).toContain(NO_VERIFICADO);
    expect(anclarItems([puerta({ texto_fuente: "" })], "3 Neltume raulí 90x210")[0].dudas).toEqual([NO_VERIFICADO]);
  });

  it("una cita que solo difiere en mayúsculas, tildes, puntuación o espacios es literal", () => {
    expect(anclarItems([puerta({ texto_fuente: "3 neltume, rauli 90x210." })], "Hola: 3 Neltume   raulí 90x210; gracias")[0].dudas).toEqual([]);
    expect(anclarItems([puerta({ texto_fuente: "«3 Neltume raulí 90x210»" })], "3 Neltume raulí 90x210")[0].dudas).toEqual([]);
  });

  it("un monto no respalda una cantidad ni una medida (ADR-0016, auditoría H-05)", () => {
    expect(cantidadesDichas("Quiero 1 puerta Neltume raulí 90x210 a $50.000")).toEqual([1]);
    expect(cantidadesDichas("Neltume raulí 90x210, pago 50 lucas")).toEqual([]);
    expect(cantidadesDichas("2 Neltume a 50 mil c/u y $ 120.000 el marco")).toEqual([2]);
    expect(cantidadesDichas("son 10.000 por puerta")).toEqual([]);
    expect(cifras("$50.000 y 50 lucas")).toEqual([]);
    const pedido = "Quiero 1 puerta Neltume raulí 90x210 a $50.000";
    expect(anclarItems([puerta({ texto_fuente: pedido, cantidad: 50 })], pedido)[0].dudas).toEqual(["La cantidad 50 no aparece en el pedido."]);
    expect(anclarItems([puerta({ texto_fuente: pedido, cantidad: 1 })], pedido)[0].dudas).toEqual([]);
  });
});

describe("cobertura del pedido (REQ-COT-2.14)", () => {
  it("detecta grupos por destino sin producto, con su cantidad, y descarta un destino sin cantidad", () => {
    expect(cantidadPedidoEliptico("2 para baño")).toBe(2);
    expect(cantidadPedidoEliptico("una para la oficina")).toBe(1);
    expect(cantidadPedidoEliptico("para dormitorio")).toBeNull();
    expect(pedidosSinRegistrar("2 para baño y 1 para dormitorio, algo económico", [], MODELOS)).toEqual(["2 para baño", "1 para dormitorio"]);
    expect(pedidosSinRegistrar("2 para baño y 1 para dormitorio", ["2 para baño"], MODELOS)).toEqual(["1 para dormitorio"]);
  });
  it("lo que pide el mensaje y la IA omitió queda como alerta", () => {
    const msj = "Necesito 2 Neltume raulí 90x210 y 3 Lican lenga 80x210. Gracias, saludos";
    expect(pedidosSinRegistrar(msj, ["2 Neltume raulí 90x210"], MODELOS)).toEqual(["3 Lican lenga 80x210"]);
    expect(pedidosSinRegistrar(msj, ["2 Neltume raulí 90x210", "3 Lican lenga 80x210"], MODELOS)).toEqual([]);
    expect(pedidosSinRegistrar("Despacho a Temuco, dirección Av. Alemania 123", [], MODELOS)).toEqual([]);
  });

  it("anclarPropuesta junta ambas cosas", () => {
    const r = anclarPropuesta({ items: [puerta({ texto_fuente: "2 Neltume raulí 90x210", cantidad: 2 })], alertas: [], sin_items: false }, "2 Neltume raulí 90x210; 4 coscos de 80 por 200", NOMBRES);
    expect(r.omitidos).toEqual(["4 coscos de 80 por 200"]);
    expect(r.propuesta.alertas).toEqual(["No registré: «4 coscos de 80 por 200». Agrégalo a mano si corresponde."]);
  });

  it("un ítem cuya frase la IA no citó tal cual queda a la vista como no verificado (REQ-COT-2.15)", () => {
    const r = anclarPropuesta({ items: [puerta({ texto_fuente: "tres puertas neltume" })], alertas: [], sin_items: false }, "Necesito 3 Neltume raulí 90x210", NOMBRES);
    expect(r.propuesta.alertas).toContain("No pude verificar el ítem 1 contra el pedido (la IA no citó el texto tal cual): revísalo.");
    expect(r.propuesta.items[0].dudas).toContain(NO_VERIFICADO);
  });
});

describe("anclaje por línea (REQ-COT-2.15)", () => {
  const dudas = (items: ItemPropuesto[], texto: string) => anclarItems(items, texto, NOMBRES).map((i) => i.dudas);

  it("el modelo debe estar escrito en su línea; un alias seguro respalda, uno dudoso no", () => {
    expect(dudas([puerta({ texto_fuente: "3 Neltume raulí 90x210", modelo: "LICAN" })], "3 Neltume raulí 90x210")).toEqual([["La línea nombra otro modelo que «LICAN»."]]);
    expect(dudas([puerta({ texto_fuente: "3 coscos raulí 90x210", modelo: "COZ COZ" })], "3 coscos raulí 90x210")).toEqual([[]]);
    expect(dudas([puerta({ texto_fuente: "3 pillo raulí 90x210", modelo: "HUILO HUILO" })], "3 pillo raulí 90x210")).toEqual([["El modelo «HUILO HUILO» no aparece en su línea."]]);
  });

  it("una línea sin modelo continúa la anterior; lo dicho para todo el pedido también respalda", () => {
    expect(dudas([puerta({}), puerta({ texto_fuente: "2 de 80x210", cantidad: 2, ancho_m: 0.8 })], "3 Neltume raulí 90x210 y 2 de 80x210")).toEqual([[], []]);
    expect(dudas([puerta({ texto_fuente: "3 de 90x210", madera: "RAULI" })], "Neltume en raulí: 3 de 90x210")).toEqual([[]]);
  });

  it("modelo, medidas o cantidad tomados de la línea de otro ítem quedan en duda", () => {
    const texto = "2 Lanco raulí 90x210 y 1 Chauquen raulí";
    const items = [puerta({ texto_fuente: "2 Lanco raulí 90x210", modelo: "LANCO", cantidad: 2 }), puerta({ texto_fuente: "1 Chauquen raulí", modelo: "CHAUQUEN", cantidad: 2 })];
    expect(dudas(items, texto)[1]).toEqual(["La cantidad 2 no aparece en el pedido.", "El ancho 0,9 m es de otra línea del pedido.", "El alto 2,1 m es de otra línea del pedido."]);
    expect(dudas([items[0], { ...items[1], modelo: "LANCO", cantidad: 1, ancho_m: null, alto_m: null }], texto)[1]).toEqual(["La línea nombra otro modelo que «LANCO»."]);
  });

  it("una medida explícita para «ambas» respalda los dos ítems sin copiar de otra línea (REQ-COT-2.15)", () => {
    const texto = "dame 2 Pirihueico, una en lenga y otra en mara, ambas de 80x200";
    const items = [
      puerta({ texto_fuente: "dame 2 Pirihueico, una en lenga", modelo: "PIRIHUEICO", madera: "LENGA", ancho_m: 0.8, alto_m: 2, cantidad: 1 }),
      puerta({ texto_fuente: "otra en mara, ambas de 80x200", modelo: "PIRIHUEICO", madera: "MARA", ancho_m: 0.8, alto_m: 2, cantidad: 1 }),
    ];
    expect(dudas(items, texto)).toEqual([[], []]);
    const sinGlobal = texto.replace("ambas", "otra");
    expect(dudas(items.map((i) => ({ ...i, texto_fuente: i.texto_fuente.replace("ambas", "otra") })), sinGlobal)[0])
      .toContain("El ancho 0,8 m es de otra línea del pedido.");
  });
});
