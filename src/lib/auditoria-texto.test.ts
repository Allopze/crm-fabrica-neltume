import { describe, expect, it } from "vitest";
import { detalle, resumenDetalle, textoAccion, textoRecurso } from "./auditoria-texto";

describe("lectura humana de la auditoría (REQ-ADM-3.2)", () => {
  it("traduce acciones y recursos, sin guiones bajos ni ids", () => {
    expect(textoAccion("consumo_produccion")).toBe("Consumo de producción");
    expect(textoAccion("crear manual")).toBe("Creación a mano");
    expect(textoAccion("POST /api/v1/ordenes/2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d/cerrar")).toBe("Registrar /ordenes/…/cerrar");
    expect(textoAccion("algo_nuevo")).toBe("Algo nuevo");
    expect(textoRecurso("nota_pedido")).toBe("Nota de pedido");
    expect(textoRecurso("otro_recurso")).toBe("Otro recurso");
  });

  it("muestra cifras y fechas en formato chileno y omite ids internos", () => {
    expect(detalle({ id: "x", cantidad: -0.2, total: 1060107, vigenciaHasta: "2026-10-22", activo: false })).toEqual([
      ["Cantidad", "-0,2"], ["Total", "$1.060.107"], ["Vigente hasta", "22-10-2026"], ["Activo", "no"],
    ]);
    expect(detalle({ motivo: "ver 2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d" })).toEqual([["Motivo", "ver …"]]);
    expect(detalle({ codigo: "INSUMOS_INSUFICIENTES" })).toEqual([["Código", "faltan insumos"]]);
    expect(detalle({ codigo: "NEL-R-4-B" })).toEqual([["Código", "NEL-R-4-B"]]);
  });

  it("resume en una línea con hasta tres campos", () => {
    expect(resumenDetalle({ estado: "aprobada", total: 5000, iva: 950, subtotal: 4050 })).toBe("Estado: aprobada · Total: $5.000 · IVA: $950 · …");
    expect(resumenDetalle(null)).toBe("");
  });
});
