// Compras desde Chipax (ADR-0021, REQ-MP-7.x): proveedores habilitados, mapeo de sus ítems a materias primas,
// facturas leídas con sus líneas y el registro de corridas. Sin montos de la factura ni URL firmadas.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { movimiento } from "./inventario";
import { materiaPrima } from "./produccion";
import { usuario } from "./seguridad";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const TIPOS_COMPRA = [33, 34, 56, 61] as const; // factura, factura exenta, nota de débito, nota de crédito
export const ESTADOS_LINEA = ["recibida", "por_asociar", "por_revisar", "ignorada"] as const;

/** Solo las facturas de estos RUT, emitidas desde `habilitadoDesde`, se leen de Chipax (REQ-MP-7.1). */
export const proveedorCompra = pgTable("proveedor_compra", {
  rut: text().primaryKey(), // normalizado: 76123456-7
  nombre: text().notNull(),
  activo: boolean().notNull().default(true),
  habilitadoDesde: date({ mode: "string" }).notNull(),
  // Las recepciones automáticas quedan a nombre de quien habilitó al proveedor (movimiento.usuario_id es obligatorio).
  habilitadoPor: uuid().notNull().references(() => usuario.id),
  creadoEn: ahora(),
}, (t) => [check("proveedor_nombre", sql`length(trim(${t.nombre})) > 0`)]);

/** Ítem del proveedor (por código o, sin código, por nombre normalizado) → materia prima y factor; o «no es materia prima». */
export const mapeoItemCompra = pgTable("mapeo_item_compra", {
  id: uuid().primaryKey().defaultRandom(),
  proveedorRut: text().notNull().references(() => proveedorCompra.rut),
  clave: text().notNull(), // «C:<código>» o «N:<nombre normalizado>»
  descripcion: text().notNull(), // el ítem como lo escribe el proveedor
  materiaPrimaId: uuid().references(() => materiaPrima.id),
  factor: numeric({ precision: 14, scale: 6, mode: "number" }),
  unidadFacturada: text(), // normalizada; nula si la factura no trae unidad
  ignorar: boolean().notNull().default(false),
  creadoPor: uuid().notNull().references(() => usuario.id),
  creadoEn: ahora(),
  actualizadoEn: ahora(),
}, (t) => [
  unique("mapeo_compra_clave").on(t.proveedorRut, t.clave),
  check("mapeo_destino", sql`${t.ignorar} OR (${t.materiaPrimaId} IS NOT NULL AND ${t.factor} > 0)`),
]);

export const compra = pgTable("compra", {
  id: uuid().primaryKey().defaultRandom(),
  chipaxId: bigint({ mode: "number" }),
  rutEmisor: text().notNull(),
  razonSocial: text().notNull(),
  tipo: integer().notNull(),
  folio: bigint({ mode: "number" }).notNull(),
  fechaEmision: date({ mode: "string" }).notNull(),
  estadoChipax: text(),
  anulada: boolean().notNull().default(false),
  xmlPendiente: boolean().notNull().default(true), // el XML aún no estaba en Chipax: se reintenta en la próxima corrida
  aviso: text(), // p. ej. «rechazada en Chipax después de recibirla: revisar»
  creadoEn: ahora(),
  sincronizadaEn: timestamp({ withTimezone: true }),
}, (t) => [
  unique("compra_documento").on(t.rutEmisor, t.tipo, t.folio),
  check("compra_tipo", sql`${t.tipo} in (33, 34, 56, 61)`),
  index("compra_fecha_idx").on(t.fechaEmision),
]);

export const compraLinea = pgTable("compra_linea", {
  id: uuid().primaryKey().defaultRandom(),
  compraId: uuid().notNull().references(() => compra.id),
  nroLinea: integer().notNull(),
  codigoItem: text(),
  nombreItem: text().notNull(),
  clave: text().notNull(),
  cantidad: numeric({ precision: 14, scale: 6, mode: "number" }),
  unidad: text(),
  precioUnitario: numeric({ precision: 18, scale: 6, mode: "number" }), // neto; solo con costos.ver (REQ-MP-7.10)
  estado: text().notNull(),
  motivoRevision: text(),
  materiaPrimaId: uuid().references(() => materiaPrima.id),
  cantidadRecibida: numeric({ precision: 12, scale: 3, mode: "number" }),
  movimientoId: uuid().references(() => movimiento.id),
  resueltaPor: uuid().references(() => usuario.id),
  resueltaEn: timestamp({ withTimezone: true }),
}, (t) => [
  unique("compra_linea_nro").on(t.compraId, t.nroLinea),
  check("compra_linea_estado", sql`${t.estado} in ('recibida', 'por_asociar', 'por_revisar', 'ignorada')`),
  check("compra_linea_recibida", sql`${t.estado} <> 'recibida' OR (${t.movimientoId} IS NOT NULL AND ${t.materiaPrimaId} IS NOT NULL)`),
  index("compra_linea_pendiente_idx").on(t.estado),
]);

/** Corridas de la sincronización y cola de «Sincronizar ahora» (sin datos de las facturas; REQ-MP-7.7). */
export const sincronizacionChipax = pgTable("sincronizacion_chipax", {
  id: uuid().primaryKey().defaultRandom(),
  solicitadaEn: ahora(),
  solicitadaPor: uuid().references(() => usuario.id), // nula = corrida programada
  inicio: timestamp({ withTimezone: true }),
  fin: timestamp({ withTimezone: true }),
  resultado: text(),
  conteos: jsonb(),
  error: text(),
}, (t) => [
  check("sincronizacion_resultado", sql`${t.resultado} IS NULL OR ${t.resultado} in ('ok', 'parcial', 'error')`),
  index("sincronizacion_fecha_idx").on(t.solicitadaEn),
]);
