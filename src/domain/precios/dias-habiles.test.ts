import { describe, expect, it } from "vitest";
import { hoySantiago, sumarDiasHabiles } from "./dias-habiles";

const feriados = new Set(["2026-10-12", "2026-10-31", "2026-11-01", "2026-12-08", "2026-12-25"]);

describe("días hábiles con feriados de Chile (REQ-COT-6.4)", () => {
  it("10 días hábiles desde el lunes 05-10-2026 saltan el feriado del 12 → 20-10-2026", () => {
    expect(sumarDiasHabiles("2026-10-05", 10, feriados)).toBe("2026-10-20");
  });

  it("salta fines de semana y feriados consecutivos", () => {
    expect(sumarDiasHabiles("2026-10-30", 1, feriados)).toBe("2026-11-02"); // vie → lun (31 y 1 son feriado/fin de semana)
    expect(sumarDiasHabiles("2026-12-24", 1, feriados)).toBe("2026-12-28");
  });

  it("0 días devuelve la misma fecha y rechaza valores inválidos", () => {
    expect(sumarDiasHabiles("2026-10-05", 0, feriados)).toBe("2026-10-05");
    expect(() => sumarDiasHabiles("2026-10-05", -1, feriados)).toThrow();
    expect(() => sumarDiasHabiles("no-fecha", 1, feriados)).toThrow();
  });

  it("la fecha de hoy se toma en hora de Santiago", () => {
    expect(hoySantiago(new Date("2026-10-06T02:30:00Z"))).toBe("2026-10-05"); // 23:30 del 5 en Chile
  });
});
