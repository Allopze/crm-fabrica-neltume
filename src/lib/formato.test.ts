import { describe, expect, it } from "vitest";
import { clp, fecha, fechaHora, metros } from "./formato";

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

  it("formatea metros con dos decimales y coma", () => {
    expect(metros(2.1)).toBe("2,10");
    expect(metros(0.9)).toBe("0,90");
  });
});
