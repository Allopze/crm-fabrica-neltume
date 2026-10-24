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

export const MIME_ADJUNTO = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export const adjuntoTienda = pgTable("adjunto_tienda", {
  sha256: text().primaryKey(),
  mime: text().notNull(),
  bytes: integer().notNull(),
  contenido: bytea().notNull(),
  creadoEn: ahora(),
}, (t) => [check("adjunto_mime", sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`)]);
