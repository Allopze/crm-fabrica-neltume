import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DocumentoInvalido, verificarDocumento } from "../integracion-tienda/documentos";
import { leerNotaTienda } from "./nota-tienda";
import { fragmentosPdf, MAX_PDF_PAGINAS, PdfDemasiadoLargo } from "./pdf-texto";

// PDF sintéticos de la tienda (datos inventados, sin clientes ni precios reales), generados por su rama del estilo común
// v1: «actual» es el estilo de producción al 25-10-2026; «estandar», el nuevo («N.º», Fraunces/Instrument Sans, pie de 7,5 pt).
// ADR-0025 D10, F22: el lector debe aceptar los dos antes de que la tienda publique el suyo. TESTING §4.
const RAIZ = "tests/fixtures/tienda/pdf";
const leer = async (archivo: string) => leerNotaTienda(await fragmentosPdf(new Uint8Array(readFileSync(`${RAIZ}/${archivo}`))));
const ESPECIALES = expect.stringMatching(/^La nota trae 4 líneas sin código del catálogo/);

describe.each([["actual"], ["estandar"]])("PDF de la nota de la tienda, estilo %s (F22, REQ-COT-8.6)", (estilo) => {
  it("1 página: número, fecha, cotización, despacho, totales y las 3 líneas, sin datos del cliente final", async () => {
    const n = await leer(`${estilo}/nota-1pag.pdf`);
    expect(n).toMatchObject({
      numero: "577", fecha: "2026-10-25", refCotizacion: "323",
      despacho: { direccion: "Camino a Niebla km 3", transporte: "Starken", proyecto: "Edificio Los Robles", entregaComprometida: "2026-11-15", entregaTexto: null },
      totales: { subtotal: 690000, total: 821100 }, avisos: [],
    });
    expect(n.lineas.map((l) => [l.codigo, l.cantidad, l.precioUnitario, l.total])).toEqual([
      ["MOL-O-3-A", 2, 90000, 180000], ["HUI-O-3-A", 2, 97500, 195000], ["RAN-O-3-A", 3, 105000, 315000],
    ]);
    expect(JSON.stringify(n)).not.toMatch(/Constructora Ejemplo/);
  });

  it("4 páginas con el encabezado repetido: lee los 27 ítems con código, el total de la nota y avisa de los 4 pedidos especiales", async () => {
    const n = await leer(`${estilo}/nota-4pag.pdf`);
    expect(n).toMatchObject({ numero: "577", totales: { subtotal: 6700000, total: 7973000 } });
    expect(n.lineas).toHaveLength(27);
    expect(n.lineas.every((l) => /^[A-Z]{3}-O-/.test(l.codigo) && l.descripcion.includes("Pino Oregon"))).toBe(true);
    expect(n.avisos).toEqual([ESPECIALES]);
  });

  // Descripción larga: la fila crece y la cantidad, centrada, queda a 41-55 pt de la referencia (antes el límite era 40 pt).
  // De la descripción del ítem alto se lee una línea intermedia: no se usa (el pedido toma la del catálogo por el código).
  it.each([["nota-fila-alta-260.pdf"], ["nota-fila-alta-180-palabras-largas.pdf"]])("%s: lee el ítem de fila alta con su cantidad y su total", async (archivo) => {
    const n = await leer(`${estilo}/${archivo}`);
    expect(n.lineas.map((l) => [l.codigo, l.cantidad, l.total])).toEqual([["MOL-O-3-A", 2, 180000], ["HUI-O-3-A", 3, 292500], ["RAN-O-3-A", 1, 105000]]);
    expect(n).toMatchObject({ totales: { subtotal: 577500, total: 687225 }, avisos: [] });
  });
});

describe("PDF de la nota de la tienda, estilo nuevo: casos aparte (F22)", () => {
  it("una entrega en texto libre queda en `entregaTexto` con su aviso, sin perderse, y lo demás se lee igual", async () => {
    const n = await leer("estandar/nota-entrega-libre.pdf");
    expect(n.despacho).toMatchObject({ entregaComprometida: null, entregaTexto: "15 de noviembre" });
    expect(n.lineas).toHaveLength(3);
    expect(n.avisos).toEqual([expect.stringMatching(/1 línea sin código del catálogo/), expect.stringContaining("15 de noviembre")]);
  });

  it("con el código en otra fuente (pdfjs lo entrega partido) igual lo lee", async () => {
    const n = await leer("estandar/nota-codigo-en-mono.pdf");
    expect(n.lineas.map((l) => l.codigo)).toEqual(["MOL-O-3-A", "HUI-O-3-A", "RAN-O-3-A"]);
  });
});

describe("PDF de la orden de trabajo de la tienda, estilo nuevo (producción: sin montos y con el N.º de la nota)", () => {
  it.each([["orden-1pag.pdf"], ["orden-4pag.pdf"]])("%s se acepta sin retención", async (archivo) => {
    const datos = readFileSync(`${RAIZ}/estandar/${archivo}`);
    const v = await verificarDocumento({ filename: archivo, contentBase64: datos.toString("base64"), sha256: createHash("sha256").update(datos).digest("hex") }, "produccion", "577");
    expect(v.retencion).toBeNull();
  });
});

// F28 (ADR-0025 D14): la tienda ya no imprime dibujos y pone las fotos del cliente en «Observaciones» de «Para fábrica»,
// agrupadas con una línea «Ítem n · producto». Muestras de su rama (datos inventados): las anclas no se mueven.
describe("PDF de la nota de la tienda sin dibujos y con fotos en las observaciones (F28, REQ-COT-8.6)", () => {
  const TRES = [["YEL-O-3-A", 1, 120000], ["MOL-O-3-A", 2, 258000], ["MAR-O-2X4-B", 2, 76000]];
  it.each([["nota-sin-fotos.pdf"], ["nota-una-foto.pdf"]])("%s: lee sus 3 ítems, el despacho y los totales sin avisos", async (archivo) => {
    const n = await leer(`fotos/${archivo}`);
    expect(n).toMatchObject({ numero: "577", refCotizacion: "323", despacho: { entregaComprometida: "2026-11-15", entregaTexto: null }, totales: { subtotal: 454000, total: 540260 }, avisos: [] });
    expect(n.lineas.map((l) => [l.codigo, l.cantidad, l.total])).toEqual(TRES);
    expect(n.lineas[0]).toMatchObject({ descripcion: "Puerta especial de tablas verticales con vidrio lateral", medidaSolicitada: "820 × 2000 mm (Hoja)" });
  });

  it("3 páginas con 8 ítems y sus fotos en «Para fábrica»: los grupos «Ítem n · …» no se leen como ítems y el croquis PDF no cambia la descripción", async () => {
    const n = await leer("fotos/nota-varias-fotos.pdf");
    expect(n).toMatchObject({ despacho: { entregaComprometida: "2026-11-15", entregaTexto: null }, totales: { subtotal: 1376000, total: 1637440 }, avisos: [] });
    expect(n.lineas.map((l) => [l.codigo, l.cantidad, l.total])).toEqual([...TRES,
      ["PAL-O-3-A", 2, 294000], ["YEL-O-3-A", 1, 120000], ["MAR-O-2X4-B", 2, 76000], ["RAN-O-3-A", 1, 138000], ["PAL-O-3-A", 2, 294000]]);
    expect(n.lineas[2].descripcion).toBe("Marco Pino Oregon 2x4 pulg. kit");
  });

  it("su orden de trabajo con fotos se acepta sin retención", async () => {
    const datos = readFileSync(`${RAIZ}/fotos/nota-varias-fotos-orden-de-trabajo.pdf`);
    const v = await verificarDocumento({ filename: "orden.pdf", contentBase64: datos.toString("base64"), sha256: createHash("sha256").update(datos).digest("hex") }, "produccion", "577");
    expect(v.retencion).toBeNull();
  });
});

describe("PDF de más de 50 páginas (F28, REQ-COT-8.6)", () => {
  const paginas = (n: number) => renderToBuffer(createElement(Document, null,
    ...Array.from({ length: n }, (_, i) => createElement(Page, { key: i, size: "A4" }, createElement(Text, null, `Página ${i + 1}`)))));

  it("se rechaza con un error claro, en vez de leer en silencio solo una parte; con 50 lee todas", async () => {
    await expect(fragmentosPdf(new Uint8Array(await paginas(MAX_PDF_PAGINAS + 1)))).rejects.toThrow(new PdfDemasiadoLargo(51));
    await expect(fragmentosPdf(new Uint8Array(await paginas(MAX_PDF_PAGINAS + 1)))).rejects.toThrow("El PDF tiene 51 páginas; el máximo es 50.");
    const leidas = await fragmentosPdf(new Uint8Array(await paginas(MAX_PDF_PAGINAS)));
    expect(new Set(leidas.map((f) => f.pagina)).size).toBe(50);
  }, 30_000);

  it("por la API de la tienda, el documento se rechaza con el mismo motivo", async () => {
    const datos = await paginas(MAX_PDF_PAGINAS + 1);
    const pedir = verificarDocumento({ filename: "nota.pdf", contentBase64: datos.toString("base64"), sha256: createHash("sha256").update(datos).digest("hex") }, "comercial", "577");
    await expect(pedir).rejects.toThrow(DocumentoInvalido);
    await expect(verificarDocumento({ filename: "nota.pdf", contentBase64: datos.toString("base64"), sha256: createHash("sha256").update(datos).digest("hex") }, "comercial", "577"))
      .rejects.toThrow("tiene 51 páginas; el máximo es 50");
  }, 30_000);
});
