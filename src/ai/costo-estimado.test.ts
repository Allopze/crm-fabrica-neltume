import { describe, expect, it } from "vitest";
import { costoEstimadoUsd, ordenarPorCostoEstimado } from "./costo-estimado";
import type { ModeloIA } from "./ajustes";

const modelo = (id: string, entrada?: number, salida?: number, nombre = id): ModeloIA => ({
  id, nombre, compatible: true, preview: false,
  ...(entrada === undefined ? {} : { precioEntradaUsdMTok: entrada }),
  ...(salida === undefined ? {} : { precioSalidaUsdMTok: salida }),
});

describe("orden de modelos para eval:ia (REQ-NFR-2)", () => {
  it("estima por llamada usando 4.000 tokens de entrada y 400 de salida", () => {
    expect(costoEstimadoUsd(modelo("economico", 0.5, 2))).toBeCloseTo(0.0028);
  });

  it("ordena por costo total estimado y resuelve empates por nombre", () => {
    const modelos = [modelo("salida-cara", 0.2, 8), modelo("b", 0.5, 2, "Beta"), modelo("a", 0.5, 2, "Alfa")];
    expect(ordenarPorCostoEstimado(modelos).map((m) => m.id)).toEqual(["a", "b", "salida-cara"]);
  });

  it("deja al final modelos sin las dos tarifas", () => {
    const modelos = [modelo("sin-salida", 0.1), modelo("gratis", 0, 0), modelo("sin-entrada", undefined, 0.1)];
    expect(ordenarPorCostoEstimado(modelos).map((m) => m.id)).toEqual(["gratis", "sin-entrada", "sin-salida"]);
  });
});
