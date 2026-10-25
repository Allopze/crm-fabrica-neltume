// Prueba de conexión con la tienda (ADR-0024; contrato en docs/contratos/prueba-conexion-v1.md): el mensaje
// `connection.test` va igual en los dos sentidos. Módulo puro (sin BD): constantes, esquema estricto, claves, armado y
// firma del mensaje que manda la fábrica, y verificación del PDF que manda la tienda.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { esPdf, fragmentosPdf } from "../pedidos/pdf-texto";
import { ORIGEN_TIENDA, VERSION_CONTRATO } from "./contrato";
import { DocumentoInvalido, sha256Hex } from "./documentos";
import { ErrorIntegracion } from "./errores";
import { firmar } from "./firma";

export const EVENTO_PRUEBA = "connection.test";
export const ORIGEN_FABRICA = "neltume-factory";
export const RUTA_PRUEBAS = "/api/integrations/neltume/connection-tests";
/** Tope del cuerpo y del PDF decodificado, en unidades binarias como las acordó el contrato (§1, §2). */
export const MAX_CUERPO_PRUEBA = 2 * 1024 * 1024;
export const MAX_PDF_PRUEBA = 1024 * 1024;
/** Pruebas que se conservan por sentido; las anteriores se borran al insertar. */
export const PRUEBAS_CONSERVADAS = 20;
export const PLAZO_ENVIO_MS = 15_000;
/** Lo que se lee de la respuesta de la tienda: la confirmación es un JSON chico. */
export const MAX_RESPUESTA_BYTES = 64 * 1024;
/** La tienda rechaza una firma de más de 300 s; pasados 240 s ya no se manda. */
export const VIGENCIA_FIRMA_S = 240;
/** Desfase de reloj a partir del cual la pantalla avisa (la ventana de la firma es de 300 s). */
export const AVISO_RELOJ_MS = 60_000;

type Origen = typeof ORIGEN_TIENDA | typeof ORIGEN_FABRICA;

const uuidMinusculas = z.uuid().refine((s) => s === s.toLowerCase(), "el UUID va en minúsculas");
const documento = z.strictObject({
  filename: z.string().regex(/^[A-Za-z0-9._-]{1,100}\.pdf$/),
  mimeType: z.literal("application/pdf"),
  contentBase64: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const sobre = <S extends Origen>(source: S) => z.strictObject({
  schemaVersion: z.literal(VERSION_CONTRATO),
  eventType: z.literal(EVENTO_PRUEBA),
  eventId: uuidMinusculas,
  source: z.literal(source),
  // No es un enum: se compara aparte con la fábrica de este lado (422 destination_mismatch).
  factoryCode: z.string().max(40),
  issuedAt: z.iso.datetime(),
  document: documento,
});

/** Lo que recibe la fábrica: cada receptor exige el `source` de la otra parte. */
export const mensajePruebaRecibida = sobre(ORIGEN_TIENDA);
/** Lo que manda la fábrica; se valida antes de firmar para no emitir nada que la tienda rechace. */
export const mensajePruebaEnviada = sobre(ORIGEN_FABRICA);
export type MensajePrueba = z.infer<typeof mensajePruebaRecibida>;

/** Clave de idempotencia: `neltume-store:connection-test:{eventId}` o `neltume-factory:connection-test:{eventId}`. */
export const clavePrueba = (source: Origen, eventId: string) => `${source}:connection-test:${eventId}`;
/** Los 8 primeros caracteres del evento: lo que el PDF muestra para cruzar lo enviado con lo visto. */
export const codigoCorto = (eventId: string) => eventId.slice(0, 8);

/** Tamaño del PDF que declara un base64, sin decodificarlo: permite rechazar con 413 antes de gastar memoria. */
export function bytesDeBase64(texto: string): number {
  const relleno = texto.endsWith("==") ? 2 : texto.endsWith("=") ? 1 : 0;
  return Math.floor((texto.length * 3) / 4) - relleno;
}

/**
 * Verifica el PDF de una prueba recibida (contrato §3, pasos 7 y 8): más de 1 MiB es 413 y todo lo demás, 422
 * (`DocumentoInvalido`): base64 canónico (estándar, con relleno y sin saltos: al volver a codificarlo sale idéntico),
 * sha256, firma `%PDF-` y que pdfjs lo abra, igual que los PDF de los pedidos.
 */
export async function verificarPdfPrueba(d: MensajePrueba["document"]): Promise<Buffer> {
  const demasiado = () => new ErrorIntegracion(413, "payload_too_large", "El PDF supera 1 MiB.");
  if (bytesDeBase64(d.contentBase64) > MAX_PDF_PRUEBA) throw demasiado();
  const contenido = Buffer.from(d.contentBase64, "base64");
  if (contenido.length > MAX_PDF_PRUEBA) throw demasiado();
  if (contenido.toString("base64") !== d.contentBase64) throw new DocumentoInvalido("el base64 no es canónico (estándar, con relleno y sin saltos de línea)");
  if (sha256Hex(contenido) !== d.sha256) throw new DocumentoInvalido("su sha256 no coincide con el contenido");
  if (!esPdf(contenido)) throw new DocumentoInvalido("no es un PDF");
  try {
    await fragmentosPdf(contenido);
  } catch {
    throw new DocumentoInvalido("el PDF está dañado o no se puede leer");
  }
  return contenido;
}

/** Una prueba lista para reenviar: los bytes exactos del cuerpo y las cabeceras con la firma de ese instante. */
export interface PruebaSaliente {
  eventId: string;
  nombreArchivo: string;
  cuerpo: Uint8Array;
  hashCuerpo: string;
  cabeceras: { "x-neltume-timestamp": string; "x-neltume-signature": string; "x-idempotency-key": string };
  firmadaEn: Date;
}

/**
 * Arma y firma el mensaje que la fábrica manda a la tienda. La firma sale de aquí, de la app: el servicio de enlace
 * reenvía estos mismos bytes y nunca conoce el secreto (ADR-0024 §3). Lanza si el PDF pasa de 1 MiB.
 */
export function armarPruebaSaliente(o: { secreto: string; fabrica: string; pdf: Buffer; eventId?: string; ahora?: Date }): PruebaSaliente {
  if (o.pdf.length > MAX_PDF_PRUEBA) throw new Error("El PDF de prueba supera 1 MiB.");
  const eventId = o.eventId ?? randomUUID();
  const ahora = o.ahora ?? new Date();
  const nombreArchivo = `prueba-conexion-${codigoCorto(eventId)}.pdf`;
  const mensaje = mensajePruebaEnviada.parse({
    schemaVersion: VERSION_CONTRATO, eventType: EVENTO_PRUEBA, eventId, source: ORIGEN_FABRICA, factoryCode: o.fabrica, issuedAt: ahora.toISOString(),
    document: { filename: nombreArchivo, mimeType: "application/pdf", contentBase64: o.pdf.toString("base64"), sha256: sha256Hex(o.pdf) },
  });
  const cuerpo = new TextEncoder().encode(JSON.stringify(mensaje));
  const firma = firmar(o.secreto, cuerpo, ahora.getTime());
  return { eventId, nombreArchivo, cuerpo, hashCuerpo: sha256Hex(cuerpo), cabeceras: { ...firma, "x-idempotency-key": clavePrueba(ORIGEN_FABRICA, eventId) }, firmadaEn: ahora };
}
