import { describe, expect, it } from "vitest";
import type { ItemPropuesto } from "@/ai/esquema";
import { type CatalogoMapeo, mapearItem } from "./mapear";

const cat: CatalogoMapeo = {
  modelos: [{ id: "mN", nombre: "NELTUME", codigo: "NEL" }, { id: "mT", nombre: "TOLTEN", codigo: "TOLT" }],
  maderas: [{ id: "dR", nombre: "RAULI", codigo: "R" }, { id: "dO", nombre: "PINO OREGON", codigo: "O" }],
  rangos: [{ codigo: "3", etiqueta: "0,80 A 0,85", minM: 0.8, maxM: 0.85 }, { codigo: "4", etiqueta: "0,90 A 0,95", minM: 0.9, maxM: 0.95 }],
  altos: [{ codigo: "A", altoM: 2.0 }, { codigo: "B", altoM: 2.1 }, { codigo: "C", altoM: 2.2 }],
  articulos: new Map([
    ["mN|dR|4|B", { id: "a1", codigo: "NEL-R-4-B" }], ["mT|dR|4|C", { id: "a2", codigo: "TOLT-R-4-C" }], ["mN|dO|3|A", { id: "a3", codigo: "NEL-O-3-A" }],
  ]),
};
const item = (p: Partial<ItemPropuesto>): ItemPropuesto => ({
  texto_fuente: "3 Neltume raulí 90x210", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [], ...p,
});

describe("mapeo exacto al catálogo (REQ-COT-2.1, 2.3–2.5)", () => {
  it("coincidencia exacta → ok con código y descripción del catálogo", () => {
    expect(mapearItem(item({}), cat)).toMatchObject({ estado: "ok", codigo: "NEL-R-4-B", cantidad: 3, descripcion: "Neltume · Raulí · 0,90 a 0,95 × 2,10 m", duda: null });
  });

  it("acepta variantes de escritura: tildes, minúsculas, 'pino' y 'oregón'", () => {
    expect(mapearItem(item({ modelo: "neltume", madera: "Pino", ancho_m: 0.85, alto_m: 2.0 }), cat)).toMatchObject({ estado: "ok", codigo: "NEL-O-3-A" });
    expect(mapearItem(item({ modelo: "Toltén", madera: "raulí", ancho_m: 0.95, alto_m: 2.2 }), cat)).toMatchObject({ estado: "ok", codigo: "TOLT-R-4-C" });
  });

  it("medida entre rangos → a pedido con referencia del rango y altura superiores", () => {
    const r = mapearItem(item({ modelo: "TOLTEN", ancho_m: 0.87, alto_m: 2.15, cantidad: 2 }), cat);
    expect(r).toMatchObject({ estado: "a_pedido", articuloId: null, referencia: { codigo: "TOLT-R-4-C" }, descripcion: "Tolten · Raulí · 0,87 × 2,15 m (medida especial)" });
  });

  it("producto o madera inexistente, sin medida o sobre la grilla → por confirmar, sin precio", () => {
    expect(mapearItem(item({ madera: "roble" }), cat)).toMatchObject({ estado: "por_confirmar", articuloId: null, duda: expect.stringContaining("roble") });
    expect(mapearItem(item({ modelo: "OSORNO" }), cat)).toMatchObject({ estado: "por_confirmar", duda: expect.stringContaining("OSORNO") });
    expect(mapearItem(item({ ancho_m: null }), cat)).toMatchObject({ estado: "por_confirmar", duda: "Falta la medida." });
    expect(mapearItem(item({ alto_m: 2.8 }), cat)).toMatchObject({ estado: "por_confirmar", duda: expect.stringContaining("supera la grilla") });
  });

  it("dudas de la IA, cantidad faltante y accesorios → por confirmar (nunca se completa en silencio)", () => {
    expect(mapearItem(item({ dudas: ["No se indica la madera"] }), cat)).toMatchObject({ estado: "por_confirmar", duda: "No se indica la madera" });
    expect(mapearItem(item({ cantidad: null }), cat)).toMatchObject({ estado: "por_confirmar", cantidad: 1, duda: "Falta la cantidad." });
    expect(mapearItem(item({ tipo: "marco" }), cat)).toMatchObject({ estado: "por_confirmar" });
  });

  it("la descripción nunca copia texto libre de la IA", () => {
    const r = mapearItem(item({ madera: "<script>roble</script>" }), cat);
    expect(r.descripcion).toBe("Ítem por confirmar");
  });
});
