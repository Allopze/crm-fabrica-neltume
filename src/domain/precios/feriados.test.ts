import { describe, expect, it } from "vitest";
import { feriadosLegales, pascua, solsticioInvierno } from "./feriados";

const fechas = (a: number) => [...feriadosLegales(a).keys()].sort();

describe("feriados de Chile por ley (REQ-COT-6.6)", () => {
  it("2026 coincide con el calendario oficial", () => {
    expect(fechas(2026)).toEqual([
      "2026-01-01", "2026-04-03", "2026-04-04", "2026-05-01", "2026-05-21", "2026-06-21", "2026-06-29", "2026-07-16",
      "2026-08-15", "2026-09-18", "2026-09-19", "2026-10-12", "2026-10-31", "2026-11-01", "2026-12-08", "2026-12-25",
    ]);
  });

  it("Pascua y Semana Santa", () => {
    expect(pascua(2026)).toEqual({ mes: 4, dia: 5 });
    expect(pascua(2027)).toEqual({ mes: 3, dia: 28 });
    expect(feriadosLegales(2027).get("2027-03-26")).toBe("Viernes Santo");
    expect(feriadosLegales(2027).get("2027-03-27")).toBe("Sábado Santo");
  });

  it("Ley 19.668: San Pedro y San Pablo y 12 de octubre se trasladan al lunes", () => {
    expect(feriadosLegales(2027).has("2027-06-28")).toBe(true); // 29 jun 2027 es martes
    expect(feriadosLegales(2027).has("2027-06-29")).toBe(false);
    expect(feriadosLegales(2027).has("2027-10-11")).toBe(true); // 12 oct 2027 es martes
    expect(feriadosLegales(2029).has("2029-10-15")).toBe(true); // 12 oct 2029 es viernes → lunes siguiente
  });

  it("leyes 20.983, 20.215 y 20.299 con casos ya ocurridos", () => {
    expect(feriadosLegales(2023).has("2023-01-02")).toBe(true); // 2 ene 2023 fue lunes
    expect(feriadosLegales(2026).has("2026-01-02")).toBe(false);
    expect(feriadosLegales(2024).has("2024-09-20")).toBe(true); // 20 sep 2024 fue viernes
    expect(feriadosLegales(2027).has("2027-09-17")).toBe(false);
    expect(feriadosLegales(2023).has("2023-10-27")).toBe(true); // 31 oct 2023 fue martes
    expect(feriadosLegales(2023).has("2023-10-31")).toBe(false);
  });

  it("Pueblos Indígenas: el solsticio en hora de Santiago", () => {
    expect(solsticioInvierno(2024)).toBe("2024-06-20");
    expect(solsticioInvierno(2025)).toBe("2025-06-20");
    expect(solsticioInvierno(2026)).toBe("2026-06-21");
    expect(feriadosLegales(2021).has("2021-06-21")).toBe(true);
    expect([...feriadosLegales(2020).values()]).not.toContain("Pueblos Indígenas");
  });
});
