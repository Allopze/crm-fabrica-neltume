import { describe, expect, it } from "vitest";
import type { CatalogoResumido, InterpreteIA } from "./interfaz";
import type { Propuesta } from "./esquema";
import { interpretarRevisado } from "./revision";

const catalogo: CatalogoResumido = { modelos: [], maderas: [], anchos: [], altosM: [], accesorios: [] };
const vacia: Propuesta = { items: [], alertas: [], sin_items: true };

describe("conservación de pedidos incompletos (REQ-COT-2.14/2.15)", () => {
  it("deja cada cantidad por destino como ítem desconocido si la IA lo omite dos veces", async () => {
    const pasadas: string[][] = [];
    const ia: InterpreteIA = {
      nombre: "doble",
      interpretar: async (_texto, _cat, opciones) => {
        pasadas.push(opciones?.omitidos ?? []);
        return { propuesta: vacia, proveedor: "doble", latenciaMs: 1 };
      },
    };
    const r = await interpretarRevisado(ia, "2 para baño y 1 para dormitorio, algo económico", catalogo, { modelos: [], alias: [] });
    expect(pasadas).toEqual([[], ["2 para baño", "1 para dormitorio"]]);
    expect(r.anclada.items.map((i) => [i.tipo, i.cantidad, i.modelo, i.texto_fuente])).toEqual([
      ["desconocido", 2, null, "2 para baño"], ["desconocido", 1, null, "1 para dormitorio"],
    ]);
    expect(r.anclada.sin_items).toBe(false);
    expect(r.anclada.alertas).toHaveLength(2);
    expect(r.resultado.propuesta).toEqual(vacia);
  });

  it("añade solo el grupo que sigue omitido cuando la segunda lectura cubre uno", async () => {
    const ia: InterpreteIA = {
      nombre: "doble",
      interpretar: async (_texto, _cat, opciones) => ({
        propuesta: opciones?.omitidos?.length ? {
          items: [{ texto_fuente: "2 para baño", tipo: "desconocido", modelo: null, madera: null, ancho_m: null,
            alto_m: null, medida_accesorio: null, cantidad: 2, dudas: ["Falta el producto."] }], alertas: [], sin_items: false,
        } : vacia,
        proveedor: "doble", latenciaMs: 1,
      }),
    };
    const r = await interpretarRevisado(ia, "2 para baño y 1 para dormitorio", catalogo, { modelos: [], alias: [] });
    expect(r.corregida).toBe(true);
    expect(r.anclada.items.map((i) => i.cantidad)).toEqual([2, 1]);
    expect(r.dudasIa).toEqual([["Falta el producto."], []]);
  });
});
