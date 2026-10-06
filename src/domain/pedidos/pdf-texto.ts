// Extracción de texto con posiciones de un PDF (ADR-0008). Solo texto: sin XFA, sin fuentes del sistema ni red.
import type { Fragmento } from "./nota-tienda";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export function esPdf(datos: Uint8Array): boolean {
  return datos.length > 5 && new TextDecoder().decode(datos.subarray(0, 5)) === "%PDF-";
}

export async function fragmentosPdf(datos: Uint8Array): Promise<Fragmento[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs 6 no evalúa código del PDF; además sin XFA, sin fuentes del sistema y deteniéndose ante errores.
  const tarea = getDocument({ data: new Uint8Array(datos), enableXfa: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true, verbosity: 0 });
  const doc = await tarea.promise;
  try {
    const fragmentos: Fragmento[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const pagina = await doc.getPage(n);
      const { items } = await pagina.getTextContent();
      for (const it of items) {
        if (!("str" in it) || !it.str.trim()) continue;
        fragmentos.push({ x: it.transform[4], y: it.transform[5], texto: it.str, pagina: n });
      }
    }
    return fragmentos;
  } finally {
    await tarea.destroy();
  }
}
