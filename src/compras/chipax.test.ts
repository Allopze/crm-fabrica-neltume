import { describe, expect, it } from "vitest";
import { normalizarCompra } from "./chipax";

describe("compras.chipax: cabecera de /v2/compras (ADR-0021)", () => {
  it("lee los nombres reales en camelCase (verificados con credenciales reales)", () => {
    expect(normalizarCompra({ id: 9, tipo: 33, folio: 120, rutEmisor: "76543210-3", razonSocial: " Maderas Ñuble SpA ", fechaEmision: "2026-10-14",
      estado: "aceptado", anulado: null, urlXmlPublica: "https://manhattan.chipax.com/xml?id=9&sig=x" }))
      .toEqual({ id: 9, tipo: 33, folio: 120, rutEmisor: "76543210-3", razonSocial: "Maderas Ñuble SpA", fechaEmision: "2026-10-14",
        estado: "aceptado", anulada: false, urlXmlPublica: "https://manhattan.chipax.com/xml?id=9&sig=x" });
  });

  it("también acepta los nombres del OpenAPI publicado (snake_case), anulado o borrado", () => {
    const c = normalizarCompra({ tipo: 61, folio: 7, rut_emisor: "76543210-3", razon_social: "X", fecha_emision: "2026-10-01T00:00:00Z", estado: null, deleted: 1 });
    expect(c).toMatchObject({ id: null, tipo: 61, rutEmisor: "76543210-3", fechaEmision: "2026-10-01", estado: null, anulada: true, urlXmlPublica: null });
    expect(normalizarCompra({ tipo: 33, folio: 1, anulado: "1" }).anulada).toBe(true);
  });
});
