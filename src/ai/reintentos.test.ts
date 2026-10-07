import { describe, expect, it } from "vitest";
import { ErrorIA, type InterpreteIA, type OpcionesInterpretacion } from "./interfaz";
import { interpretarConReintentos } from "./reintentos";

const cat = { modelos: [], maderas: [], anchos: [], altosM: [], accesorios: [] };
const ok = { propuesta: { items: [], alertas: [], sin_items: true }, proveedor: "falso", latenciaMs: 1 };

/** Intérprete que responde con la lista dada, en orden, y anota las opciones que recibió. */
function falso(respuestas: (ErrorIA | typeof ok)[]) {
  const recibidas: (OpcionesInterpretacion | undefined)[] = [];
  const ia: InterpreteIA = {
    nombre: "falso",
    interpretar: async (_t, _c, o) => { recibidas.push(o); const r = respuestas.shift()!; if (r instanceof ErrorIA) throw r; return r; },
  };
  return { ia, recibidas };
}

describe("reintentos acotados (AI.md §5)", () => {
  it("tras una salida inválida reintenta una vez diciéndole al modelo qué falló", async () => {
    const { ia, recibidas } = falso([new ErrorIA("invalida", "Salida fuera del esquema: items.0.cantidad: Invalid input"), ok]);
    await interpretarConReintentos(ia, "3 Neltume", cat, { esperasMs: [0] });
    expect(recibidas).toEqual([undefined, { correccion: "Salida fuera del esquema: items.0.cantidad: Invalid input" }]);
  });

  it("un error transitorio no agrega corrección, y una salida inválida dos veces se rinde", async () => {
    const t = falso([new ErrorIA("transitorio", "Proveedor respondió 503"), ok]);
    await interpretarConReintentos(t.ia, "x", cat, { esperasMs: [0] });
    expect(t.recibidas).toEqual([undefined, undefined]);
    const inv = falso([new ErrorIA("invalida", "a"), new ErrorIA("invalida", "b"), ok]);
    await expect(interpretarConReintentos(inv.ia, "x", cat, { esperasMs: [0] })).rejects.toMatchObject({ tipo: "invalida" });
    expect(inv.recibidas).toHaveLength(2);
  });

  it("la segunda pasada conserva las partes omitidas junto a la corrección", async () => {
    const { ia, recibidas } = falso([new ErrorIA("invalida", "motivo"), ok]);
    await interpretarConReintentos(ia, "x", cat, { esperasMs: [0], maxReintentos: 1, omitidos: ["2 Lican"] });
    expect(recibidas[1]).toEqual({ omitidos: ["2 Lican"], correccion: "motivo" });
  });
});
