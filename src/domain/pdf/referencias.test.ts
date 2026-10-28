import sharp from "sharp";
import { describe, expect, it } from "vitest";
import tokens from "../../../docs/contratos/estilo-documentos-tokens.json";
import { reducirAlPresupuesto, reducirImagen } from "./referencias";

// Imágenes de referencia del cliente para el PDF (ADR-0025 D14; REQ-COT-4.14; TESTING U `pdf.referencias`).
const imagen = (ancho: number, alto: number, formato: "png" | "webp" | "jpeg", alfa = 1) =>
  sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 10, g: 120, b: 200, alpha: alfa } } })[formato]().toBuffer();

describe("pdf.referencias: reducción de las imágenes del cliente", () => {
  it.each([["png"], ["webp"], ["jpeg"]] as const)("%s grande: JPEG de 1000 px de lado mayor con su proporción", async (formato) => {
    const r = (await reducirImagen(await imagen(3000, 1500, formato)))!;
    expect([r.ancho, r.alto]).toEqual([tokens.imagenesReferencia.ladoMaxPx, 500]);
    const meta = await sharp(r.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1000, 500]);
  });

  it("una vertical también se limita por su lado mayor y una chica no se agranda", async () => {
    expect(await reducirImagen(await imagen(900, 1800, "png"))).toMatchObject({ ancho: 500, alto: 1000 });
    expect(await reducirImagen(await imagen(400, 300, "jpeg"))).toMatchObject({ ancho: 400, alto: 300 });
  });

  it("la transparencia sale sobre fondo blanco", async () => {
    const r = (await reducirImagen(await imagen(200, 200, "png", 0)))!;
    const { data } = await sharp(r.data).raw().toBuffer({ resolveWithObject: true });
    expect(Math.min(...data.subarray(0, 30))).toBeGreaterThanOrEqual(250);
  });

  it("con la calidad del estándar (80) pesa bastante menos que el original", async () => {
    const original = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer();
    const r = (await reducirImagen(original))!;
    expect(tokens.imagenesReferencia.calidadJpeg).toBe(0.8);
    expect(r.data.length).toBeLessThan(original.length / 4);
  });

  it("las imágenes de un documento caben en el presupuesto: baja la calidad y luego el lado, todas por igual (estándar §5, 27-10-2026)", async () => {
    const ruido = (semilla: number) => sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: semilla, g: 128, b: 90 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    const originales = await Promise.all([10, 60, 120].map(ruido));
    const sinRecorte = await reducirAlPresupuesto(originales);
    expect(sinRecorte.excede).toBe(false);
    expect(sinRecorte.imagenes.map((i) => i!.ancho)).toEqual([1000, 1000, 1000]);
    // Con un presupuesto chico baja la calidad; si no basta, también el lado, nunca bajo el mínimo.
    const total = (r: Awaited<ReturnType<typeof reducirAlPresupuesto>>) => r.imagenes.reduce((t, i) => t + i!.data.length, 0);
    const holgado = total(sinRecorte);
    const ajustado = await reducirAlPresupuesto(originales, Math.round(holgado * 0.7));
    expect(ajustado.excede).toBe(false);
    expect(total(ajustado)).toBeLessThanOrEqual(Math.round(holgado * 0.7));
    const imposible = await reducirAlPresupuesto(originales, 1000);
    expect(imposible.excede).toBe(true);
    expect(imposible.imagenes.map((i) => i!.ancho)).toEqual([tokens.imagenesReferencia.ladoMinPx, tokens.imagenesReferencia.ladoMinPx, tokens.imagenesReferencia.ladoMinPx]);
    expect(tokens.imagenesReferencia).toMatchObject({ calidadJpegMin: 0.5, ladoMinPx: 320, presupuestoBytes: 4 * 1024 * 1024 });
  });

  it("una imagen dañada o que no es imagen devuelve nulo (se nombra en vez de romper el PDF)", async () => {
    const png = await imagen(300, 300, "png");
    expect(await reducirImagen(png.subarray(0, 60))).toBeNull();
    expect(await reducirImagen(Buffer.from("%PDF-1.7 no es una imagen"))).toBeNull();
  });
});
