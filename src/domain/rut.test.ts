import { describe, expect, it } from "vitest";
import { digitoVerificador, formatearRut, normalizarRut, rutValido } from "./rut";

describe("RUT chileno (REQ-COT-9.1)", () => {
  it("calcula el dígito verificador por módulo 11 (incluye K y 0)", () => {
    expect(digitoVerificador(12345678)).toBe("5");
    expect(digitoVerificador(11111111)).toBe("1");
    expect(digitoVerificador(10000013)).toBe("K");
    expect(digitoVerificador(76086428)).toBe("5");
  });

  it("acepta RUT válidos con o sin puntos y rechaza los inválidos", () => {
    expect(rutValido("12.345.678-5")).toBe(true);
    expect(rutValido("12345678-5")).toBe(true);
    expect(rutValido("10.000.013-k")).toBe(true);
    expect(rutValido("12.345.678-9")).toBe(false);
    expect(rutValido("hola")).toBe(false);
    expect(rutValido("1-9")).toBe(false); // demasiado corto para una empresa o persona
  });

  it("normaliza y formatea", () => {
    expect(normalizarRut("12.345.678-k")).toBe("12345678-K");
    expect(formatearRut("123456785")).toBe("12.345.678-5");
  });
});
