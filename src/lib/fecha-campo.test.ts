import { describe, expect, it } from "vitest";
import { formatearMientrasEscribe, hoyIso, leerFecha, semanasDelMes, sumarDias } from "./fecha-campo";

describe("campo de fecha dd-mm-aaaa (UX §1, REQ-NFR-9)", () => {
  it("lee la fecha escrita a la chilena, con o sin separadores, y la entrega como aaaa-mm-dd", () => {
    expect(leerFecha("21-10-2026")).toBe("2026-10-21");
    expect(leerFecha("21/10/2026")).toBe("2026-10-21");
    expect(leerFecha("1.2.26")).toBe("2026-02-01");
    expect(leerFecha("21102026")).toBe("2026-10-21");
    expect(leerFecha("2026-10-21")).toBe("2026-10-21");
  });

  it("rechaza fechas que no existen", () => {
    expect(leerFecha("31-02-2026")).toBeNull();
    expect(leerFecha("29-02-2027")).toBeNull();
    expect(leerFecha("29-02-2028")).toBe("2028-02-29");
    expect(leerFecha("10-2026")).toBeNull();
    expect(leerFecha("")).toBeNull();
  });

  it("pone los guiones mientras se escriben cifras", () => {
    expect(formatearMientrasEscribe("2")).toBe("2");
    expect(formatearMientrasEscribe("2110")).toBe("21-10");
    expect(formatearMientrasEscribe("21102026")).toBe("21-10-2026");
    expect(formatearMientrasEscribe("21/10")).toBe("21/10");
  });

  it("calcula hoy en Santiago y arma el mes con el lunes primero", () => {
    expect(hoyIso(new Date("2026-10-22T02:30:00Z"))).toBe("2026-10-21");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    const octubre = semanasDelMes(2026, 10);
    expect(octubre[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(octubre.flat().filter(Boolean)).toHaveLength(31);
  });
});
