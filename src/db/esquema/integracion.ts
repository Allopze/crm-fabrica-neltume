// Recepción automática de las notas de pedido de la tienda (ADR-0023; contrato en docs/contratos/pedidos-tienda-v1.md).
// Cada evento firmado deja una fila en `recepcion_tienda`; sus PDF y los adjuntos del cliente se guardan en la BD
// (entran en los respaldos y no hay rutas de disco que manipular). Documentos y adjuntos son de solo inserción.
import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { notaPedido } from "./comercial";
import { usuario } from "./seguridad";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const ESTADOS_RECEPCION = [
  "incorporada", // creó (o vinculó) la nota de pedido de la fábrica
  "pendiente_revision", // revisión de una nota ya en curso: espera a una persona
  "anulacion_solicitada", // anulación de una nota ya en curso: espera a una persona
  "aplicada", // una persona aplicó la revisión o la anulación
  "descartada", // una persona la descartó, con motivo
  "cancelada", // anulación aplicada sola (la nota seguía pendiente)
  "registrada", // anulación de un pedido desconocido o ya cerrado: solo se recuerda
] as const;

export const recepcionTienda = pgTable("recepcion_tienda", {
  id: uuid().primaryKey().defaultRandom(),
  idempotenciaClave: text().notNull().unique(), // neltume-store:{sourceOrderId}:PANGUIPULLI:{revision}
  eventId: uuid().notNull().unique(),
  hashCuerpo: text().notNull(), // SHA-256 de los bytes recibidos: un reintento trae los mismos
  tipoEvento: text().notNull(), // order.ready | order.cancelled
  sourceOrderId: text().notNull(),
  revision: integer().notNull(),
  numeroNota: text().notNull(), // orderNumber de la tienda
  notaPedidoId: uuid().references(() => notaPedido.id), // la nota creada, o la vigente a la que se refiere
  estado: text().notNull(),
  payload: jsonb().notNull(), // el mensaje sin documentos, sin datos personales del cliente final y sin lo comercial
  comercial: jsonb(), // order.commercial: solo con pedidos.importes.ver
  avisos: text().array().notNull().default(sql`'{}'`),
  resueltaPor: uuid().references(() => usuario.id),
  resueltaEn: timestamp({ withTimezone: true }),
  motivoResolucion: text(),
  creadoEn: ahora(),
}, (t) => [
  check("recepcion_estado", sql`${t.estado} in ('incorporada', 'pendiente_revision', 'anulacion_solicitada', 'aplicada', 'descartada', 'cancelada', 'registrada')`),
  check("recepcion_evento", sql`${t.tipoEvento} in ('order.ready', 'order.cancelled')`),
  check("recepcion_revision", sql`${t.revision} > 0`),
  check("recepcion_resolucion", sql`(${t.resueltaEn} IS NULL) = (${t.resueltaPor} IS NULL)`),
  unique("recepcion_revision_unica").on(t.sourceOrderId, t.revision),
  index("recepcion_nota_idx").on(t.notaPedidoId),
]);

export const documentoTienda = pgTable("documento_tienda", {
  id: uuid().primaryKey().defaultRandom(),
  recepcionId: uuid().notNull().references(() => recepcionTienda.id),
  tipo: text().notNull(), // comercial | produccion
  contenido: bytea().notNull(),
  sha256: text().notNull(),
  bytes: integer().notNull(),
  nombreOrigen: text().notNull(), // solo informativo: nunca es una ruta
  retenido: boolean().notNull().default(false), // PDF de producción con montos o sin el N.º de la nota: no se sirve
  motivoRetencion: text(),
  creadoEn: ahora(),
}, (t) => [
  check("documento_tipo", sql`${t.tipo} in ('comercial', 'produccion')`),
  check("documento_retencion", sql`${t.retenido} = (${t.motivoRetencion} IS NOT NULL)`),
  unique("documento_por_recepcion").on(t.recepcionId, t.tipo),
]);

/** Prueba de conexión con la tienda (ADR-0024): una fila por prueba, recibida de la tienda o enviada a ella. */
export const ESTADOS_PRUEBA = [
  "recibida", // llegó de la tienda y se guardó
  "pendiente", // enviada: la app la firmó y espera al servicio de enlace
  "enviando", // enviada: el servicio la tomó y espera la respuesta
  "aceptada", // la tienda la guardó (2xx con su identidad y el mismo eventId)
  "duplicada", // la tienda ya la tenía (200 duplicate): también cuenta como entregada
  "rechazada", // la tienda respondió con un error, o con otra identidad
  "sin_respuesta", // red, plazo, redirección o caída del servicio: no se supo qué pasó
  "no_configurada", // falta ENLACE_TIENDA_URL en el servicio de enlace
  "vencida", // la firma pasó de 4 min antes de enviarse: no se manda, la tienda la rechazaría
] as const;

/**
 * Contrato en docs/contratos/prueba-conexion-v1.md. Guarda el PDF y el resultado de las últimas 20 pruebas por sentido
 * (las demás se borran al insertar; la auditoría recuerda quién probó y cuándo). Una prueba no crea pedidos ni toca
 * `recepcion_tienda`. Mientras espera o se envía, la fila lleva la solicitud ya firmada que reenvía `enlace`, que no
 * conoce el secreto; al terminar se borra.
 */
export const pruebaConexion = pgTable("prueba_conexion", {
  id: uuid().primaryKey().defaultRandom(),
  direccion: text().notNull(), // enviada | recibida
  eventId: uuid().notNull(),
  estado: text().notNull(),
  hashCuerpo: text().notNull(), // SHA-256 del cuerpo JSON: un reintento de la tienda trae el mismo
  contenido: bytea().notNull(), // el PDF
  sha256: text().notNull(), // del PDF
  bytes: integer().notNull(), // del PDF
  nombreArchivo: text().notNull(),
  // Solo enviadas, y solo mientras esperan o se envían:
  solicitud: bytea(), // el cuerpo JSON firmado, con el PDF en base64
  cabeceras: jsonb(), // x-neltume-timestamp, x-neltume-signature y x-idempotency-key
  firmadaEn: timestamp({ withTimezone: true }), // cuándo se firmó: pasados 4 min la tienda la rechazaría
  creadoPor: uuid().references(() => usuario.id), // quien apretó el botón
  // Resultado del envío (lo escribe `enlace`):
  tomadaEn: timestamp({ withTimezone: true }),
  destino: text(), // host de la tienda al que se envió
  httpStatus: integer(),
  codigoError: text(), // error.code de la tienda o la clave del diagnóstico
  detalle: text(), // el diagnóstico que ve la persona
  latenciaMs: integer(),
  desfaseRelojMs: integer(), // reloj de la tienda menos el nuestro; positivo = adelantado
  creadoEn: ahora(),
  resueltoEn: timestamp({ withTimezone: true }),
}, (t) => [
  check("prueba_direccion", sql`${t.direccion} in ('enviada', 'recibida')`),
  check("prueba_estado", sql`${t.estado} in ('recibida', 'pendiente', 'enviando', 'aceptada', 'duplicada', 'rechazada', 'sin_respuesta', 'no_configurada', 'vencida')`),
  check("prueba_estado_direccion", sql`(${t.direccion} = 'recibida') = (${t.estado} = 'recibida')`),
  check("prueba_solicitud", sql`(${t.solicitud} IS NOT NULL) = (${t.direccion} = 'enviada' AND ${t.estado} in ('pendiente', 'enviando'))`),
  check("prueba_cabeceras", sql`(${t.cabeceras} IS NULL) = (${t.solicitud} IS NULL)`),
  check("prueba_autor", sql`(${t.creadoPor} IS NOT NULL) = (${t.direccion} = 'enviada')`),
  check("prueba_firma", sql`(${t.firmadaEn} IS NOT NULL) = (${t.direccion} = 'enviada')`),
  check("prueba_bytes", sql`${t.bytes} > 0`),
  unique("prueba_evento_unico").on(t.direccion, t.eventId),
  index("prueba_lista_idx").on(t.direccion, t.creadoEn),
  index("prueba_pendiente_idx").on(t.creadoEn).where(sql`${t.estado} = 'pendiente'`),
]);

export const MIME_ADJUNTO = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export const adjuntoTienda = pgTable("adjunto_tienda", {
  sha256: text().primaryKey(),
  mime: text().notNull(),
  bytes: integer().notNull(),
  contenido: bytea().notNull(),
  creadoEn: ahora(),
}, (t) => [check("adjunto_mime", sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`)]);
