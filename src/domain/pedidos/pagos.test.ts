import { describe, expect, it } from "vitest";
import { diasAtraso } from "./consulta";
import { calcularPago } from "./pagos";

describe("pagos.estado (REQ-COT-8.10, 8.12; ADR-0020)", () => {
  const base = { total: 358_191, abonoPct: 50, exigePago: true };

  it("el abono se redondea al peso hacia arriba y define sin abono → abonado → pagado", () => {
    expect(calcularPago({ ...base, pagado: 0 })).toEqual({ total: 358_191, pagado: 0, saldo: 358_191, abonoPct: 50, abonoRequerido: 179_096, faltaAbono: 179_096, estado: "sin_abono" });
    expect(calcularPago({ ...base, pagado: 179_095 })).toMatchObject({ estado: "sin_abono", faltaAbono: 1 });
    expect(calcularPago({ ...base, pagado: 179_096 })).toMatchObject({ estado: "abonado", faltaAbono: 0, saldo: 179_095 });
    expect(calcularPago({ ...base, pagado: 358_191 })).toMatchObject({ estado: "pagado", saldo: 0 });
  });

  it("se puede pagar el total de una vez, y el % de abono es configurable", () => {
    expect(calcularPago({ ...base, pagado: 358_191 }).estado).toBe("pagado");
    expect(calcularPago({ ...base, abonoPct: 30, pagado: 107_458 })).toMatchObject({ abonoRequerido: 107_458, estado: "abonado" });
    expect(calcularPago({ ...base, abonoPct: 0, pagado: 0 })).toMatchObject({ abonoRequerido: 0, estado: "abonado" });
  });

  it("una nota anterior al control de pagos y sin pagos queda «sin control»; con pagos, se calcula igual", () => {
    expect(calcularPago({ ...base, exigePago: false, pagado: 0 }).estado).toBe("sin_control");
    expect(calcularPago({ ...base, exigePago: false, pagado: 358_191 }).estado).toBe("pagado");
  });
});

describe("pedidos.atraso (REQ-COT-8.15)", () => {
  it("cuenta los días desde la entrega comprometida solo en notas abiertas", () => {
    expect(diasAtraso("2026-10-10", "en_produccion", "2026-10-14")).toBe(4);
    expect(diasAtraso("2026-10-14", "pendiente", "2026-10-14")).toBe(0);
    expect(diasAtraso("2026-10-10", "despachada", "2026-10-14")).toBe(0);
    expect(diasAtraso(null, "lista", "2026-10-14")).toBe(0);
  });
});
