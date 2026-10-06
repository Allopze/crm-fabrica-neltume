import { describe, expect, it } from "vitest";
import { HERRAMIENTA_PROPONER_ITEMS, Propuesta } from "./esquema";
import { normalizarPedido, redactar } from "./redaccion";

const item = { texto_fuente: "3 Neltume", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [] };

describe("esquema de salida del LLM (AI.md §2, SECURITY T1–T2)", () => {
  it("acepta una propuesta válida", () => {
    expect(Propuesta.parse({ items: [item], alertas: [], sin_items: false }).items[0].cantidad).toBe(3);
  });

  it("rechaza cualquier campo de importe o descuento, aunque el LLM lo invente", () => {
    expect(() => Propuesta.parse({ items: [{ ...item, precio_unitario: 1 }], alertas: [], sin_items: false })).toThrow();
    expect(() => Propuesta.parse({ items: [item], alertas: [], sin_items: false, descuento: 0.9 })).toThrow();
  });

  it("rechaza cantidades y medidas fuera de rango", () => {
    expect(() => Propuesta.parse({ items: [{ ...item, cantidad: 0 }], alertas: [], sin_items: false })).toThrow();
    expect(() => Propuesta.parse({ items: [{ ...item, cantidad: 2.5 }], alertas: [], sin_items: false })).toThrow();
    expect(() => Propuesta.parse({ items: [{ ...item, ancho_m: 90 }], alertas: [], sin_items: false })).toThrow();
  });

  it("el JSON Schema de la herramienta no expone campos de precio y prohíbe propiedades extra", () => {
    const s = JSON.stringify(HERRAMIENTA_PROPONER_ITEMS.function.parameters);
    expect(s).not.toMatch(/precio|descuento|total|importe/i);
    expect(s).toContain('"additionalProperties":false');
  });
});

describe("redacción de datos personales antes del LLM (REQ-COT-2.9)", () => {
  it("enmascara RUT, correo, teléfono y URL", () => {
    const { texto, reemplazos } = redactar("Saludos, Javiera — +56 9 8765 4321, javiera@correo.cl, RUT 12.345.678-9, ver www.obra.cl/plano");
    expect(texto).toBe("Saludos, Javiera — [TELEFONO], [CORREO], RUT [RUT], ver [URL]");
    expect(reemplazos).toBe(4);
  });

  it("enmascara variantes de RUT y teléfonos fijos, y no toca medidas ni cantidades", () => {
    const { texto } = redactar("rut 76086428-5 fono 2 2345 6789 o 987654321; 3 puertas de 90x210 y 2 de 0,87x2,15");
    expect(texto).toBe("rut [RUT] fono [TELEFONO] o [TELEFONO]; 3 puertas de 90x210 y 2 de 0,87x2,15");
  });

  it("normaliza separadores de medida y comillas", () => {
    expect(normalizarPedido("3 puertas  de 90 × 210 «raulí»\r\n")).toBe('3 puertas de 90x210 "raulí"');
  });
});
