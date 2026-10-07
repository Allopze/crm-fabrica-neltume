import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { medidasPorAccesorio } from "@/domain/cotizaciones/catalogo";
import { Propuesta } from "./esquema";
import type { CatalogoResumido } from "./interfaz";
import { EJEMPLOS, mensajeUsuario, motivoEsquema, promptSistema } from "./prompt";

const cat: CatalogoResumido = {
  modelos: ["ENSENADA", "NELTUME"], maderas: ["LENGA", "MARA", "PINO OREGON", "RAULI"], anchos: [{ codigo: "3", etiqueta: "0,80 A 0,85" }], altosM: [2.1],
  accesorios: ["MARCO"], medidasAccesorio: [{ tipo: "MARCO", secciones: ["2X4", "2X6"], largosM: [2, 2.1] }],
};

describe("prompt del intérprete (AI.md §4)", () => {
  it("lleva las secciones y largos de cada accesorio, y los ejemplos", () => {
    const p = promptSistema(cat);
    expect(p).toContain("  - MARCO: secciones 2x4 / 2x6; largos 2,00 / 2,10 m.");
    expect(p).toContain("<pedido>2 Ensenada en ráuli de 80x210 medida de vano</pedido>");
    expect(p).toMatch(/NO son dudas/);
    expect(p).not.toMatch(/\$|precio de lista/);
  });

  it("cada ejemplo cumple el esquema estricto de la herramienta y cita su texto tal cual", () => {
    for (const [pedido, salida] of EJEMPLOS) {
      const propuesta = Propuesta.parse(JSON.parse(salida));
      for (const item of propuesta.items) expect(pedido).toContain(item.texto_fuente);
    }
  });

  it("ningún ejemplo repite un pedido del set de evaluación (no se filtra la evaluación al prompt)", () => {
    const { casos } = JSON.parse(readFileSync("eval/casos.json", "utf8")) as { casos: { pedido: string }[] };
    const plano = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const [pedido] of EJEMPLOS) {
      const frases = plano(pedido).split(/\s+y\s+|\.\s/);
      for (const c of casos) for (const f of frases) expect(plano(c.pedido)).not.toContain(f.trim());
    }
  });

  it("el reintento tras una salida inválida le dice al modelo qué falló, sin perder el pedido delimitado", () => {
    const m = mensajeUsuario("3 Neltume", [], "items.0.cantidad: Invalid input");
    expect(m).toBe("<pedido>\n3 Neltume\n</pedido>\n\nRevisión del sistema: tu respuesta anterior no se pudo usar (items.0.cantidad: Invalid input). Vuelve a llamar a proponer_items con todos los campos del esquema.");
    const r = Propuesta.safeParse({ items: [{ texto_fuente: "x", precio_unitario: 1 }], alertas: [], sin_items: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(motivoEsquema(r.error)).toMatch(/^items\.0/);
  });
});

describe("medidas de accesorios para el prompt (REQ-COT-2.13)", () => {
  it("agrupa por tipo sin repetir por madera y ordena secciones por número", () => {
    const piezas = ["LENGA", "RAULI"].flatMap(() => [
      { tipo: "ENDOLADO", seccion: "12X1", largoM: 3 }, { tipo: "ENDOLADO", seccion: "6X4,5", largoM: 1 },
      { tipo: "ENDOLADO", seccion: "6X1", largoM: 2 }, { tipo: "MARCO", seccion: "2x8", largoM: 2.1 }, { tipo: "MARCO", seccion: "2X4", largoM: 2 },
    ]);
    expect(medidasPorAccesorio(piezas)).toEqual([
      { tipo: "ENDOLADO", secciones: ["6X1", "6X4,5", "12X1"], largosM: [1, 2, 3] },
      { tipo: "MARCO", secciones: ["2X4", "2X8"], largosM: [2, 2.1] },
    ]);
  });
});
