// Movimientos de inventario inmutables (ADR-0002, DATA-MODEL §2). El saldo nunca se guarda: es la vista v_stock.
// Cada puerta física tiene su fila y su código; su existencia sale de sus movimientos (ADR-0018).
import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { articulo, bodega } from "./catalogo";
import { materiaPrima } from "./produccion";
import { usuario } from "./seguridad";

export const TIPOS_MOVIMIENTO = ["entrada_produccion", "recepcion", "salida_despacho", "consumo_produccion", "ajuste", "reserva", "liberacion"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export const CALIDADES = ["primera", "segunda"] as const;
export const ORIGENES_PUERTA = ["inventario_inicial", "produccion", "manual", "conversion"] as const;

/** Una puerta física (REQ-STK-8.1). Ubicación, calidad y observación se editan con auditoría; el artículo no cambia. */
export const puerta = pgTable("puerta", {
  id: uuid().primaryKey().defaultRandom(),
  codigo: text().notNull().unique(), // el de la etiqueta: 202308000000210
  articuloId: uuid().notNull().references(() => articulo.id),
  anchoMm: integer(), // medida exacta si se conoce; si no, la del artículo
  altoMm: integer(),
  ubicacion: text().notNull(),
  calidad: text().notNull().default("primera"),
  observacion: text(),
  fechaProduccion: date({ mode: "string" }),
  origen: text().notNull(),
  creadoPor: uuid().references(() => usuario.id),
  creadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("puerta_id_articulo_uk").on(t.id, t.articuloId),
  check("puerta_calidad", sql`${t.calidad} in ('primera', 'segunda')`),
  check("puerta_origen", sql`${t.origen} in ('inventario_inicial', 'produccion', 'manual', 'conversion')`),
  check("puerta_codigo", sql`length(${t.codigo}) between 3 and 40 AND ${t.codigo} = upper(trim(${t.codigo}))`),
  check("puerta_medida", sql`(${t.anchoMm} IS NULL OR ${t.anchoMm} between 100 and 4000) AND (${t.altoMm} IS NULL OR ${t.altoMm} between 100 and 4000)`),
  check("puerta_ubicacion", sql`length(trim(${t.ubicacion})) > 0`),
  index("puerta_articulo_idx").on(t.articuloId),
]);

export const movimiento = pgTable("movimiento", {
  id: uuid().primaryKey().defaultRandom(),
  ocurridoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  bodegaId: uuid().notNull().references(() => bodega.id),
  articuloId: uuid().references(() => articulo.id),
  materiaPrimaId: uuid().references(() => materiaPrima.id),
  puertaId: uuid(), // con FK compuesta a (puerta.id, puerta.articulo_id)
  tipo: text().notNull(),
  cantidad: numeric({ precision: 12, scale: 3, mode: "number" }).notNull(),
  motivo: text(),
  refTipo: text(), // orden | pedido | recepcion | conteo | manual | puerta | inventario …
  refId: text(),
  idempotenciaClave: text().unique(),
  usuarioId: uuid().notNull().references(() => usuario.id),
}, (t) => [
  check("mov_item_xor", sql`(${t.articuloId} IS NULL) <> (${t.materiaPrimaId} IS NULL)`),
  check("mov_tipo", sql`${t.tipo} in ('entrada_produccion', 'recepcion', 'salida_despacho', 'consumo_produccion', 'ajuste', 'reserva', 'liberacion')`),
  check("mov_cantidad_no_cero", sql`${t.cantidad} <> 0`),
  check("mov_signo", sql`(${t.tipo} in ('entrada_produccion', 'recepcion', 'reserva') AND ${t.cantidad} > 0)
    OR (${t.tipo} in ('salida_despacho', 'consumo_produccion', 'liberacion') AND ${t.cantidad} < 0)
    OR ${t.tipo} = 'ajuste'`),
  check("mov_ajuste_motivo", sql`${t.tipo} <> 'ajuste' OR length(trim(coalesce(${t.motivo}, ''))) > 0`),
  check("mov_reserva_solo_puertas", sql`${t.tipo} not in ('reserva', 'liberacion') OR ${t.articuloId} IS NOT NULL`),
  check("mov_puertas_enteras", sql`${t.articuloId} IS NULL OR ${t.cantidad} = trunc(${t.cantidad})`),
  check("mov_puerta_unidad", sql`${t.puertaId} IS NULL OR abs(${t.cantidad}) = 1`),
  // Que las existencias de una puerta (familia «puerta») se muevan con su puerta lo exige un trigger (migración 0019):
  // un CHECK no ve la familia del modelo. Los accesorios siguen por cantidad.
  foreignKey({ name: "mov_puerta_fk", columns: [t.puertaId, t.articuloId], foreignColumns: [puerta.id, puerta.articuloId] }),
  index("mov_articulo_idx").on(t.articuloId, t.bodegaId),
  index("mov_mp_idx").on(t.materiaPrimaId, t.bodegaId),
  index("mov_ref_idx").on(t.refTipo, t.refId),
  index("mov_puerta_idx").on(t.puertaId),
]);

/** Hoja «Despachos» de la planilla de la fábrica, tal cual y de solo inserción (REQ-STK-10). Sin importes. */
export const despachoHistorico = pgTable("despacho_historico", {
  id: uuid().primaryKey().defaultRandom(),
  fila: integer().notNull(),
  codigo: text(),
  modelo: text(),
  medida: text(),
  madera: text(),
  fechaProduccion: date({ mode: "string" }),
  fechaTexto: text(), // lo escrito, si no era una fecha válida
  estado: text(),
  cliente: text(),
  documento: text(),
  nota: text(),
  dudas: text().array().notNull().default(sql`'{}'::text[]`),
  huella: text().notNull().unique(),
  creadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("historico_codigo_idx").on(t.codigo),
  index("historico_documento_idx").on(t.documento),
]);
