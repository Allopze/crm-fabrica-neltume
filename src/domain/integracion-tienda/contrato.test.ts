import { describe, expect, it } from "vitest";
import { lineaTienda, mensajeAnulacion, mensajeListo, pdf } from "../../../tests/fixtures/tienda/mensaje";
import { clavePedido, mensajeTienda, payloadConservado } from "./contrato";
import { coincideTipo, decodificarBase64, DocumentoInvalido, verificarDocumento } from "./documentos";
import { descripcionEspecial, medidaSolicitada, observacionItem } from "./lineas";

describe("integracion.contrato (ADR-0023 §2, contrato v1)", () => {
  it("acepta order.ready y order.cancelled y rechaza campos de más o mezclados", async () => {
    const m = await mensajeListo();
    expect(mensajeTienda.safeParse(m).success).toBe(true);
    expect(mensajeTienda.safeParse(mensajeAnulacion(m.sourceOrderId, 2)).success).toBe(true);
    expect(mensajeTienda.safeParse({ ...m, extra: 1 }).success).toBe(false);
    expect(mensajeTienda.safeParse({ ...m, order: { ...m.order, discountPct: 10 } }).success).toBe(false);
    expect(mensajeTienda.safeParse({ ...m, cancellation: mensajeAnulacion(m.sourceOrderId, 2).cancellation }).success).toBe(false);
    expect(mensajeTienda.safeParse({ ...m, order: { ...m.order, items: [] } }).success).toBe(false);
    expect(mensajeTienda.safeParse({ ...m, schemaVersion: "2.0" }).success).toBe(false);
    expect(clavePedido(mensajeTienda.parse(m))).toBe(`neltume-store:${m.sourceOrderId}:PANGUIPULLI:1`);
  });

  it("lo que se conserva no trae datos personales del cliente final ni lo comercial (D1, REQ-COT-8.9)", async () => {
    const guardado = JSON.stringify(payloadConservado(mensajeTienda.parse(await mensajeListo())));
    for (const dato of ["Cliente Final de Prueba", "12.345.678-5", "+56 9 1111 2222", "Calle Falsa 123", "Construcción", "Vendedora 1", "contentBase64", "unitPrice"]) {
      expect(guardado).not.toContain(dato);
    }
    expect(guardado).toContain("Casa Lago");
  });
});

describe("integracion.documentos (ADR-0023 §6)", () => {
  it("verifica sha256 y firma PDF; retiene el de producción con montos o sin el número", async () => {
    const m = await mensajeListo();
    const ok = await verificarDocumento(m.documents.production, "produccion", "577");
    expect(ok.retencion).toBeNull();
    expect((await verificarDocumento(m.documents.commercial, "comercial", "577")).retencion).toBeNull();
    const conPrecio = (await mensajeListo({ produccion: ["Nota de pedido N° 577", "Total $ 1.000"] })).documents.production;
    expect((await verificarDocumento(conPrecio, "produccion", "577")).retencion).toMatch(/montos/);
    const sinNumero = (await mensajeListo({ produccion: ["Orden de trabajo"] })).documents.production;
    expect((await verificarDocumento(sinNumero, "produccion", "577")).retencion).toMatch(/577/);
    await expect(verificarDocumento(m.documents.commercial, "comercial", "578")).rejects.toBeInstanceOf(DocumentoInvalido);
    await expect(verificarDocumento({ ...m.documents.commercial, sha256: "0".repeat(64) }, "comercial", "577")).rejects.toThrow(/sha256/);
    const texto = Buffer.from("no soy un pdf");
    const falso = { filename: "x.pdf", contentBase64: texto.toString("base64"), sha256: (await import("./documentos")).sha256Hex(texto) };
    await expect(verificarDocumento(falso, "comercial", "577")).rejects.toThrow(/no es un PDF/);
  });

  it("base64 estricto y bytes mágicos de los adjuntos", async () => {
    expect(() => decodificarBase64("ab c", 100)).toThrow(DocumentoInvalido);
    expect(() => decodificarBase64("A".repeat(200), 100)).toThrow(/supera/);
    expect(decodificarBase64(Buffer.from("hola").toString("base64"), 100).toString()).toBe("hola");
    expect(coincideTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(coincideTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/png")).toBe(true);
    expect(coincideTipo(Buffer.from("RIFF\0\0\0\0WEBPVP8 "), "image/webp")).toBe(true);
    expect(coincideTipo(await pdf(["x"]), "application/pdf")).toBe(true);
    expect(coincideTipo(Buffer.from([0xff, 0xd8, 0xff]), "image/png")).toBe(false);
  });
});

describe("integracion.lineas (ADR-0023 §5, D3, D4)", () => {
  it("medida, observaciones y descripción de un especial desde los campos estructurados", () => {
    const base = lineaTienda(1, "FUY-O-2-A", 2) as unknown as Parameters<typeof observacionItem>[0];
    expect(medidaSolicitada(base.dimensions)).toBe("720 × 2000 mm (Hoja)");
    expect(medidaSolicitada({ ...base.dimensions, requested: null })).toBe("720 × 2000 mm, hoja");
    expect(medidaSolicitada({ widthMm: null, heightMm: null, lengthMm: 2100, section: "2X4", measureType: null, requested: null })).toBe("2X4 × 2100 mm");
    expect(observacionItem({ ...base, descriptionEdited: true, description: "Panel liso", observations: "Bisagras a la derecha" }, true))
      .toBe("Descripción de la tienda: Panel liso\nBisagras a la derecha");
    expect(observacionItem(base, true)).toBeNull();
    expect(descripcionEspecial({ ...base, isCustom: true, catalogReference: null, description: "Puerta según diseño · Roble" })).toBe("Puerta según diseño · Roble");
    expect(descripcionEspecial({ ...base, productCode: "IA-123", description: "Puerta Lican" })).toBe("Puerta Lican (ref. tienda: FUY-O-2-A · 0,70–0,75 × 2,00 m)");
  });
});
