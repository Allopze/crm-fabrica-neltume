import { describe, expect, it } from "vitest";
import { codigoDeNombre, codigoFueraCatalogo, fechaPlausible, leerMadera, leerMedida, leerModelo, limpiarObservacion, normalizarUbicacion } from "./normalizar";

// Lectura de los datos de una puerta tal como los escribe la fábrica (ADR-0018, REQ-STK-9.1).
describe("puertas.normalizar", () => {
  it("lee medidas en cm × m, con decimales o sin espacios", () => {
    expect(leerMedida("90 X 2,00")).toEqual({ anchoMm: 900, altoMm: 2000 });
    expect(leerMedida("78 X 2,066")).toEqual({ anchoMm: 780, altoMm: 2066 });
    expect(leerMedida("88,5X2,10")).toEqual({ anchoMm: 885, altoMm: 2100 });
    expect(leerMedida("78 X 240,6")).toEqual({ anchoMm: 780, altoMm: 2406 });
    expect(leerMedida("0,90 x 2,10")).toEqual({ anchoMm: 900, altoMm: 2100 });
    expect(leerMedida("ilegible")).toBeNull();
    expect(leerMedida(90)).toBeNull();
  });

  it("separa la calidad del nombre del modelo y normaliza la madera", () => {
    expect(leerModelo("MOLCO SEGUNDA")).toEqual({ modelo: "MOLCO", calidad: "segunda" });
    expect(leerModelo(" coz coz ")).toEqual({ modelo: "COZ COZ", calidad: "primera" });
    expect(leerModelo("PUÑIR")).toEqual({ modelo: "PUNIR", calidad: "primera" });
    expect(leerMadera("OREGON")).toBe("PINO OREGON");
    expect(leerMadera("Raulí")).toBe("RAULI");
    expect(leerMadera("PINO BLANCO")).toBe("PINO BLANCO");
  });

  it("normaliza ubicaciones conocidas y errores de tipeo", () => {
    expect(normalizarUbicacion("GALPON ATRÁS")).toBe("Galpón atrás");
    expect(normalizarUbicacion("FABIRCA")).toBe("Fábrica");
    expect(normalizarUbicacion("ELTIT VILLARRICA")).toBe("Eltit Villarrica");
    expect(normalizarUbicacion("  ")).toBe("Fábrica");
  });

  it("limpia observaciones: sin «OK», sin repetir y en oración", () => {
    expect(limpiarObservacion("OK")).toBeNull();
    expect(limpiarObservacion(null, "OK // BARNIZ, BISAGRAS")).toBe("Barniz, bisagras");
    expect(limpiarObservacion("SIN FILM", "OK")).toBe("Sin film");
    expect(limpiarObservacion("MUESTRARIO", "OK // MUESTRARIO")).toBe("Muestrario");
  });

  it("acepta fechas de producción entre 2015 y hoy", () => {
    expect(fechaPlausible(new Date("2023-07-04"), "2026-10-07")).toBe("2023-07-04");
    expect(fechaPlausible("2204-01-01", "2026-10-07")).toBeNull();
    expect(fechaPlausible("***", "2026-10-07")).toBeNull();
  });

  it("arma códigos fuera de catálogo con la medida exacta", () => {
    expect(codigoFueraCatalogo("MOL", "O", 780, 2066)).toBe("MOL-O-780X2066");
    expect(codigoDeNombre("ESPECIAL LOS LAGOS // RANCO")).toBe("ESPECIAL-LOS-LAGOS-RANCO");
    expect(codigoDeNombre("PINO BLANCO", 3)).toBe("PIN");
  });
});
