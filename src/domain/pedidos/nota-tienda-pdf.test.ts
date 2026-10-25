import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verificarDocumento } from "../integracion-tienda/documentos";
import { leerNotaTienda } from "./nota-tienda";
import { fragmentosPdf } from "./pdf-texto";

// PDF sintéticos de la tienda (datos inventados, sin clientes ni precios reales), generados por su rama del estilo común
// v1: «actual» es el estilo de producción al 25-10-2026; «estandar», el nuevo («N.º», Fraunces/Instrument Sans, pie de 7,5 pt).
// ADR-0025 D10, F22: el lector debe aceptar los dos antes de que la tienda publique el suyo. TESTING §4.
const RAIZ = "tests/fixtures/tienda/pdf";
const leer = async (archivo: string) => leerNotaTienda(await fragmentosPdf(new Uint8Array(readFileSync(`${RAIZ}/${archivo}`))));
const ESPECIALES = expect.stringMatching(/^La nota trae 4 líneas sin «Referencia de catálogo»/);

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
    expect(n.avisos).toEqual([expect.stringMatching(/1 línea sin «Referencia de catálogo»/), expect.stringContaining("15 de noviembre")]);
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
