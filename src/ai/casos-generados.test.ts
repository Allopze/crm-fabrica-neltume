import { describe, expect, it } from "vitest";
import { anclarItems, anclarPropuesta } from "@/domain/cotizaciones/anclaje";
import { mapearItem, type CatalogoMapeo } from "@/domain/cotizaciones/mapear";
import { generarCasos, generarConIdeales } from "./casos-generados";

const maderas = [{ id: "o", nombre: "PINO OREGON", codigo: "O" }, { id: "r", nombre: "RAULI", codigo: "R" }, { id: "l", nombre: "LENGA", codigo: "L" }];
const modelos = [{ id: "nel", nombre: "NELTUME", codigo: "NEL" }, { id: "coz", nombre: "COZ COZ", codigo: "COZ" }];
const rangos = [{ codigo: "3", etiqueta: "0,80 A 0,85", minM: 0.8, maxM: 0.85 }, { codigo: "4", etiqueta: "0,86 A 0,90", minM: 0.86, maxM: 0.9 }];
const altos = [{ codigo: "A", altoM: 2 }, { codigo: "B", altoM: 2.1 }];
const articulos = new Map(modelos.flatMap((m) => maderas.flatMap((d) => rangos.flatMap((r) => altos.map((a) => [`${m.id}|${d.id}|${r.codigo}|${a.codigo}`, { id: `${m.codigo}-${d.codigo}-${r.codigo}-${a.codigo}`, codigo: `${m.codigo}-${d.codigo}-${r.codigo}-${a.codigo}` }] as const)))));
const accesorios = [{ id: "mar", nombre: "MARCO", codigo: "MAR" }, { id: "gua", nombre: "GUARDAPOLVO", codigo: "GUA" }];
const piezas = maderas.flatMap((d) => [
  ...["2X4", "2X6"].flatMap((s) => [2, 2.1].map((l) => ({ id: `MAR-${d.codigo}-${s}-${l}`, codigo: `MAR-${d.codigo}-${s}-${l}`, modeloId: "mar", maderaId: d.id, seccion: s, largoM: l }))),
  { id: `GUA-${d.codigo}-12X1-3`, codigo: `GUA-${d.codigo}-12X1-3`, modeloId: "gua", maderaId: d.id, seccion: "12X1", largoM: 3 },
]);
const cat: CatalogoMapeo = { modelos, maderas, rangos, altos, articulos, alias: [], accesorios, piezas };

describe("casos de evaluación generados con semilla (AI.md §6)", () => {
  it("la misma semilla da los mismos casos; otra semilla, otros", () => {
    expect(generarCasos(cat, 30, 7)).toEqual(generarCasos(cat, 30, 7));
    expect(generarCasos(cat, 30, 7).map((c) => c.pedido)).not.toEqual(generarCasos(cat, 30, 8).map((c) => c.pedido));
  });

  it("cubre los tres grupos, sin montos en el texto, y lo esperado sale del mapeo del catálogo", () => {
    const casos = generarCasos(cat, 200, 1);
    expect(new Set(casos.map((c) => c.grupo))).toEqual(new Set(["claro", "accesorio", "ambiguo"]));
    for (const c of casos) {
      expect(c.pedido).not.toMatch(/\$|precio|lucas/i);
      for (const e of c.esperado) if (e.estado === "ok") expect([...[...articulos.values()].map((a): string => a.codigo), ...piezas.map((p) => p.codigo)]).toContain(e.codigo);
      expect(c.grupo === "ambiguo").toBe(c.esperado.some((e) => e.estado !== "ok"));
    }
  });

  it("la lectura ideal de cada pedido pasa el anclaje sin dudas ni omisiones (texto y esperado coherentes)", () => {
    const nombres = { modelos: modelos.map((m) => m.nombre), alias: [] };
    for (const { caso, ideales } of generarConIdeales(cat, 300, 3)) {
      const { propuesta, omitidos } = anclarPropuesta({ items: ideales, alertas: [], sin_items: false }, caso.pedido, nombres);
      expect({ pedido: caso.pedido, omitidos, dudas: propuesta.items.flatMap((i) => i.dudas), alertas: propuesta.alertas })
        .toEqual({ pedido: caso.pedido, omitidos: [], dudas: [], alertas: [] });
    }
  });

  it("un dato faltante queda por confirmar y nunca ok", () => {
    const ambiguos = generarCasos(cat, 200, 5).filter((c) => c.grupo === "ambiguo");
    expect(ambiguos.length).toBeGreaterThan(20);
    for (const c of ambiguos) expect(c.esperado.some((e) => e.estado === "por_confirmar")).toBe(true);
    // Sanidad del mapeo usado como referencia.
    const ideal = { texto_fuente: "2 Neltume raulí 80x210", tipo: "puerta" as const, modelo: "NELTUME", madera: "RAULI", ancho_m: 0.8, alto_m: 2.1, medida_accesorio: null, cantidad: 2, dudas: [] };
    expect(mapearItem(ideal, cat).codigo).toBe("NEL-R-3-B");
    expect(anclarItems([ideal], ideal.texto_fuente)[0].dudas).toEqual([]);
  });
});
