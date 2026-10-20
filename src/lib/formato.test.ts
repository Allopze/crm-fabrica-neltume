import { describe, expect, it } from "vitest";
import { clp, fecha, fechaHora, metros, cantidad, leerCantidad, usoPorPuerta } from "./formato";

describe("formato chileno (REQ-STK-2.3, REQ-NFR-9)", () => {
  it("formatea CLP sin decimales y con punto de miles", () => {
    expect(clp(1234567)).toBe("$1.234.567");
    expect(clp(277759.6)).toBe("$277.760");
    expect(clp(0)).toBe("$0");
  });

  it("formatea fechas dd-mm-aaaa", () => {
    expect(fecha("2026-10-05")).toBe("05-10-2026");
    expect(fechaHora("2026-10-05T10:42:00")).toBe("05-10-2026 10:42");
  });

  it("lee los timestamps con zona en America/Santiago, no en UTC", () => {
    // Octubre: Chile está en UTC-3. Las 02:42 UTC son las 23:42 del día anterior.
    expect(fechaHora("2026-10-05T02:42:00Z")).toBe("04-10-2026 23:42");
    expect(fecha("2026-10-05T02:42:00Z")).toBe("04-10-2026");
    expect(fechaHora("2026-10-05T02:42:00.000+00:00")).toBe("04-10-2026 23:42");
    expect(fechaHora(new Date("2026-10-05T02:42:00Z"))).toBe("04-10-2026 23:42");
  });

  it("formatea metros con dos decimales y coma", () => {
    expect(metros(2.1)).toBe("2,10");
    expect(metros(0.9)).toBe("0,90");
  });
});

describe("cantidades de receta (REQ-MP-3.1)", () => {
  it("muestran 4 decimales y la lectura «1 cada N»; se escriben con coma o como fracción", () => {
    expect(cantidad(1 / 70)).toBe("0,0143");
    expect(usoPorPuerta(0.0143)).toBe("1 cada 70 puertas");
    expect(usoPorPuerta(0.1)).toBe("1 cada 10 puertas");
    expect(usoPorPuerta(0.4)).toBeNull();
    expect(usoPorPuerta(2)).toBeNull();
    expect(leerCantidad("1/70")).toBeCloseTo(1 / 70, 10);
    expect(leerCantidad("0,4")).toBe(0.4);
    expect(leerCantidad("abc")).toBeNaN();
  });
});
