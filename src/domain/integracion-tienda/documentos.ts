// Verificación de los PDF y adjuntos que manda la tienda (ADR-0023 §2 paso 5, §6). Base64 estricto, tamaño, sha256,
// firma `%PDF-` y que pdfjs lo abra; el de producción además debe mostrar el N.º de la nota y ningún monto en pesos:
// si no, el pedido igual entra, pero ese PDF queda retenido y no se sirve.
import { createHash } from "node:crypto";
import { esPdf, fragmentosPdf, MAX_PDF_PAGINAS, PdfDemasiadoLargo } from "../pedidos/pdf-texto";

export const MAX_DOCUMENTO_BYTES = 8 * 1024 * 1024;
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;

export class DocumentoInvalido extends Error {}

export const sha256Hex = (datos: Uint8Array) => createHash("sha256").update(datos).digest("hex");

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Base64 estándar con relleno y sin saltos de línea (RFC 4648 §4), acotado antes de decodificar. */
export function decodificarBase64(texto: string, max: number): Buffer {
  if (texto.length > Math.ceil(max / 3) * 4) throw new DocumentoInvalido(`supera ${Math.round(max / 1024 / 1024)} MB`);
  if (!BASE64.test(texto)) throw new DocumentoInvalido("no es base64 válido");
  return Buffer.from(texto, "base64");
}

/** Un monto en pesos escrito en el PDF («$159.485», «$ 1.000»): no puede estar en el de producción. */
const MONTO = /\$\s?\d/;

export interface DocumentoVerificado { contenido: Buffer; sha256: string; nombre: string; retencion: string | null }

/**
 * Verifica un documento del mensaje. Lanza DocumentoInvalido (422) si está dañado o no es lo que dice ser; en el de
 * producción devuelve `retencion` si trae montos o no muestra el N.º de la nota (ADR-0023, contrato §2).
 */
export async function verificarDocumento(
  d: { filename: string; contentBase64: string; sha256: string }, tipo: "comercial" | "produccion", numeroNota: string,
): Promise<DocumentoVerificado> {
  const contenido = decodificarBase64(d.contentBase64, MAX_DOCUMENTO_BYTES);
  if (contenido.length > MAX_DOCUMENTO_BYTES) throw new DocumentoInvalido(`supera ${MAX_DOCUMENTO_BYTES / 1024 / 1024} MB`);
  if (sha256Hex(contenido) !== d.sha256) throw new DocumentoInvalido("su sha256 no coincide con el contenido");
  if (!esPdf(contenido)) throw new DocumentoInvalido("no es un PDF");
  let texto: string;
  try {
    texto = (await fragmentosPdf(contenido)).map((f) => f.texto).join(" ");
  } catch (e) {
    if (e instanceof PdfDemasiadoLargo) throw new DocumentoInvalido(`tiene ${e.paginas} páginas; el máximo es ${MAX_PDF_PAGINAS}`);
    throw new DocumentoInvalido("el PDF está dañado o no se puede leer");
  }
  const muestraNumero = new RegExp(`(^|\\D)${numeroNota.replace(/\D/g, "")}(\\D|$)`).test(texto);
  let retencion: string | null = null;
  if (tipo === "comercial" && !muestraNumero) throw new DocumentoInvalido(`no muestra el N.º ${numeroNota} de la nota`);
  if (tipo === "produccion" && MONTO.test(texto)) retencion = "El PDF de producción trae montos en pesos: no se muestra a producción.";
  else if (tipo === "produccion" && !muestraNumero) retencion = `El PDF de producción no muestra el N.º ${numeroNota} de la nota.`;
  return { contenido, sha256: d.sha256, nombre: d.filename, retencion };
}

/** Bytes mágicos de cada tipo de adjunto aceptado (contrato §2): el Content-Type no basta. */
export function coincideTipo(datos: Uint8Array, mime: string): boolean {
  const b = Buffer.from(datos.subarray(0, 12));
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  if (mime === "application/pdf") return esPdf(datos);
  return false;
}
