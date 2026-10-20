// Clientes (datos personales: SECURITY §4), cotizaciones y pedidos (DATA-MODEL §2; REQ-COT).
import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { articulo, listaPrecio } from "./catalogo";
import { usuario } from "./seguridad";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const cliente = pgTable("cliente", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull(),
  rut: text().notNull().unique(), // normalizado: 12345678-5
  tipo: text().notNull().default("directo"), // tienda | directo
  giro: text(),
  direccion: text(),
  direccionDespacho: text(),
  comuna: text(),
  contacto: text(),
  email: text(),
  telefono: text(),
  creadoEn: ahora(),
  actualizadoEn: ahora(),
}, (t) => [
  check("cliente_tipo", sql`${t.tipo} in ('tienda', 'directo')`),
  index("cliente_nombre_idx").on(t.nombre),
]);

// --- Cotizaciones (REQ-COT-2–8). Importes en pesos enteros (bigint). Inmutable desde "aprobada" (trigger). ---

const pesos = () => bigint({ mode: "number" });

export const ESTADOS_COTIZACION = ["interpretando", "borrador", "ia_fallida", "aprobada", "aceptada"] as const;

export const cotizacion = pgTable("cotizacion", {
  id: uuid().primaryKey().defaultRandom(),
  numero: serial().notNull().unique(),
  clienteId: uuid().references(() => cliente.id),
  estado: text().notNull(),
  origen: text().notNull(), // ia | manual
  textoOriginal: text(),
  interpretacionIa: jsonb(),
  alertas: jsonb().notNull().default([]),
  listaId: uuid().references(() => listaPrecio.id),
  subtotal: pesos().notNull().default(0),
  descuentoPct: numeric({ precision: 5, scale: 4, mode: "number" }).notNull().default(0),
  descuentoMotivo: text(),
  descuento: pesos().notNull().default(0),
  neto: pesos().notNull().default(0),
  iva: pesos().notNull().default(0),
  total: pesos().notNull().default(0),
  vigenciaHasta: date({ mode: "string" }),
  notas: text(),
  aprobadaPor: uuid().references(() => usuario.id),
  aprobadaEn: timestamp({ withTimezone: true }),
  creadoPor: uuid().notNull().references(() => usuario.id),
  creadoEn: ahora(),
  actualizadoEn: ahora(),
  version: integer().notNull().default(1),
}, (t) => [
  check("cotizacion_estado", sql`${t.estado} in ('interpretando', 'borrador', 'ia_fallida', 'aprobada', 'aceptada')`),
  check("cotizacion_origen", sql`${t.origen} in ('ia', 'manual')`),
  check("cotizacion_descuento", sql`${t.descuentoPct} >= 0 AND ${t.descuentoPct} < 1 AND (${t.descuentoPct} = 0 OR length(trim(coalesce(${t.descuentoMotivo}, ''))) > 0)`),
  index("cotizacion_estado_idx").on(t.estado, t.creadoEn),
  index("cotizacion_cliente_idx").on(t.clienteId),
]);

export const cotizacionItem = pgTable("cotizacion_item", {
  id: uuid().primaryKey().defaultRandom(),
  cotizacionId: uuid().notNull().references(() => cotizacion.id),
  orden: integer().notNull(),
  articuloId: uuid().references(() => articulo.id),
  descripcion: text().notNull(), // del catálogo; nunca texto de la IA (DATA-MODEL)
  cantidad: integer().notNull(),
  estadoItem: text().notNull(), // ok | por_confirmar | a_pedido
  duda: text(),
  textoFuente: text(), // fragmento del texto del cliente que originó el ítem
  medidaSolicitada: text(), // la pedida en mm, con hoja/vano si se dijo (REQ-COT-2.12)
  precioNetoLista: numeric({ precision: 14, scale: 4, mode: "number" }),
  recargoPct: numeric({ precision: 6, scale: 4, mode: "number" }),
  precioUnitario: pesos(),
  totalLinea: pesos(),
  precioReferencia: pesos(),
  referenciaCodigo: text(),
  fijadoPor: uuid().references(() => usuario.id),
  modificadoPor: uuid().references(() => usuario.id),
  modificadoEn: timestamp({ withTimezone: true }),
}, (t) => [
  check("item_estado", sql`${t.estadoItem} in ('ok', 'por_confirmar', 'a_pedido')`),
  check("item_cantidad", sql`${t.cantidad} > 0`),
  check("item_ok_con_precio", sql`${t.estadoItem} <> 'ok' OR (${t.precioUnitario} IS NOT NULL AND ${t.totalLinea} = ${t.precioUnitario} * ${t.cantidad})`),
  index("item_cotizacion_idx").on(t.cotizacionId, t.orden),
]);

// --- Cola y registro de IA (ADR-0006, AI.md) ---
export const trabajoIa = pgTable("trabajo_ia", {
  id: uuid().primaryKey().defaultRandom(),
  cotizacionId: uuid().notNull().references(() => cotizacion.id),
  estado: text().notNull().default("pendiente"),
  intentos: integer().notNull().default(0),
  tomadoEn: timestamp({ withTimezone: true }),
  error: text(),
  creadoEn: ahora(),
}, (t) => [
  check("trabajo_estado", sql`${t.estado} in ('pendiente', 'en_curso', 'listo', 'fallido')`),
  index("trabajo_pendiente_idx").on(t.estado, t.creadoEn),
]);

export const llamadaIa = pgTable("llamada_ia", {
  id: uuid().primaryKey().defaultRandom(),
  trabajoId: uuid().notNull().references(() => trabajoIa.id),
  proveedor: text().notNull(),
  modelo: text(),
  entradaRedactada: text().notNull(), // texto ya enmascarado: sin RUT, correo ni teléfono
  salida: jsonb(),
  tokensEntrada: integer(),
  tokensSalida: integer(),
  costoUsd: numeric({ precision: 10, scale: 6, mode: "number" }),
  latenciaMs: integer(),
  resultado: text().notNull(), // ok | invalida | error | timeout | tope
  creadoEn: ahora(),
}, (t) => [index("llamada_fecha_idx").on(t.creadoEn)]);

// --- Notas de pedido (REQ-COT-8, REQ-STK-7). Copia congelada de los ítems de la cotización aceptada. ---
export const ESTADOS_PEDIDO = ["pendiente", "en_produccion", "lista", "despachada", "cancelada"] as const;

export const notaPedido = pgTable("nota_pedido", {
  id: uuid().primaryKey().defaultRandom(),
  numero: serial().notNull().unique(),
  cotizacionId: uuid().unique().references(() => cotizacion.id), // una por cotización (REQ-COT-8.3); nula si viene de la tienda
  origen: text().notNull().default("cotizacion"), // cotizacion | nota_tienda (ADR-0008)
  refExterna: text(), // N° de la nota de pedido de la tienda
  archivoHash: text(), // SHA-256 del PDF importado (el archivo no se guarda)
  proyecto: text(),
  clienteId: uuid().notNull().references(() => cliente.id),
  direccionDespacho: text(),
  medioTransporte: text(),
  estado: text().notNull().default("pendiente"),
  creadoPor: uuid().notNull().references(() => usuario.id),
  creadoEn: ahora(),
  canceladaPor: uuid().references(() => usuario.id),
  canceladaEn: timestamp({ withTimezone: true }),
  motivoCancelacion: text(),
  entregaComprometida: date({ mode: "string" }),
  observaciones: text(),
  listaEn: timestamp({ withTimezone: true }),
  despachadaEn: timestamp({ withTimezone: true }),
  despachadaPor: uuid().references(() => usuario.id),
  // Pagos (ADR-0020): las notas anteriores a la migración no exigen pago; las excepciones van con motivo, quién y cuándo.
  exigePago: boolean().notNull().default(true),
  excepcionAbonoMotivo: text(),
  excepcionAbonoPor: uuid().references(() => usuario.id),
  excepcionAbonoEn: timestamp({ withTimezone: true }),
  excepcionSaldoMotivo: text(),
  excepcionSaldoPor: uuid().references(() => usuario.id),
  excepcionSaldoEn: timestamp({ withTimezone: true }),
}, (t) => [
  check("pedido_estado", sql`${t.estado} in ('pendiente', 'en_produccion', 'lista', 'despachada', 'cancelada')`),
  check("pedido_origen", sql`(${t.origen} = 'cotizacion' AND ${t.cotizacionId} IS NOT NULL) OR (${t.origen} = 'nota_tienda' AND ${t.refExterna} IS NOT NULL AND ${t.archivoHash} IS NOT NULL)`),
  unique("pedido_nota_tienda_unica").on(t.clienteId, t.refExterna),
  unique("pedido_archivo_unico").on(t.archivoHash),
  check("pedido_cancelacion", sql`${t.estado} <> 'cancelada' OR length(trim(coalesce(${t.motivoCancelacion}, ''))) > 0`),
  check("pedido_excepcion_abono", sql`(${t.excepcionAbonoEn} IS NULL) = (${t.excepcionAbonoMotivo} IS NULL) AND (${t.excepcionAbonoEn} IS NULL) = (${t.excepcionAbonoPor} IS NULL) AND length(trim(coalesce(${t.excepcionAbonoMotivo}, 'x'))) > 0`),
  check("pedido_excepcion_saldo", sql`(${t.excepcionSaldoEn} IS NULL) = (${t.excepcionSaldoMotivo} IS NULL) AND (${t.excepcionSaldoEn} IS NULL) = (${t.excepcionSaldoPor} IS NULL) AND length(trim(coalesce(${t.excepcionSaldoMotivo}, 'x'))) > 0`),
  index("pedido_estado_idx").on(t.estado, t.creadoEn),
]);

export const pedidoItem = pgTable("pedido_item", {
  id: uuid().primaryKey().defaultRandom(),
  notaPedidoId: uuid().notNull().references(() => notaPedido.id),
  orden: integer().notNull(),
  articuloId: uuid().references(() => articulo.id), // nulo en ítems a pedido: se fabrican
  descripcion: text().notNull(),
  medidaSolicitada: text(), // la que pidió el cliente si difiere del artículo (p. ej. «830 × 2360 mm, vano»)
  cantidad: integer().notNull(),
  reservado: integer().notNull().default(0),
  faltante: integer().notNull().default(0),
  precioUnitario: pesos().notNull(),
  totalLinea: pesos().notNull(),
}, (t) => [
  check("pedido_item_cantidades", sql`${t.cantidad} > 0 AND ${t.reservado} >= 0 AND ${t.faltante} >= 0 AND ${t.reservado} + ${t.faltante} = ${t.cantidad}`),
  index("pedido_item_pedido_idx").on(t.notaPedidoId, t.orden),
]);

// --- Pagos de la nota de pedido (ADR-0020, REQ-COT-8.10–8.14). Solo inserción (trigger); el estado de pago se calcula. ---
export const MEDIOS_PAGO = ["transferencia", "efectivo", "cheque", "tarjeta", "otro"] as const;

export const pagoPedido = pgTable("pago_pedido", {
  id: uuid().primaryKey().defaultRandom(),
  notaPedidoId: uuid().notNull().references(() => notaPedido.id),
  monto: pesos().notNull(), // positivo; negativo solo en un reverso (= −monto del pago anulado)
  fecha: date({ mode: "string" }).notNull(), // la del comprobante
  medio: text().notNull(),
  referencia: text(), // N.º de transferencia o comprobante; nunca números de tarjeta o cuenta
  revierteId: uuid().unique().references((): AnyPgColumn => pagoPedido.id),
  motivo: text(),
  registradoPor: uuid().notNull().references(() => usuario.id),
  creadoEn: ahora(),
}, (t) => [
  check("pago_medio", sql`${t.medio} in ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro')`),
  check("pago_signo", sql`(${t.revierteId} IS NULL AND ${t.monto} > 0) OR (${t.revierteId} IS NOT NULL AND ${t.monto} < 0 AND length(trim(coalesce(${t.motivo}, ''))) > 0)`),
  index("pago_pedido_nota_idx").on(t.notaPedidoId, t.creadoEn),
]);
