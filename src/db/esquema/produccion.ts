// Materias primas, BOM y órdenes de producción (DATA-MODEL §2; REQ-MP-1–4).
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articulo, modelo } from "./catalogo";
import { notaPedido } from "./comercial";
import { usuario } from "./seguridad";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const unidad = pgTable("unidad", {
  codigo: text().primaryKey(), // un, m, m2, m3, pulg, kg, lt
  nombre: text().notNull(),
});

export const materiaPrima = pgTable("materia_prima", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(),
  unidadCodigo: text().notNull().references(() => unidad.codigo),
  stockMinimo: numeric({ precision: 12, scale: 3, mode: "number" }),
  activo: boolean().notNull().default(true),
  creadoEn: ahora(),
}, (t) => [
  check("mp_minimo", sql`${t.stockMinimo} IS NULL OR ${t.stockMinimo} >= 0`),
]);

/** Lista de materiales por modelo y, opcionalmente, por medida. Una nueva versión = fila nueva (vigente_desde). */
export const bom = pgTable("bom", {
  id: uuid().primaryKey().defaultRandom(),
  modeloId: uuid().notNull().references(() => modelo.id),
  anchoCodigo: text(),
  altoCodigo: text(),
  origen: text().notNull(), // real | demo
  vigenteDesde: ahora(),
  creadoPor: uuid().references(() => usuario.id),
}, (t) => [
  check("bom_origen", sql`${t.origen} in ('real', 'demo')`),
  index("bom_modelo_idx").on(t.modeloId, t.vigenteDesde),
]);

export const bomLinea = pgTable("bom_linea", {
  bomId: uuid().notNull().references(() => bom.id, { onDelete: "cascade" }),
  materiaPrimaId: uuid().notNull().references(() => materiaPrima.id),
  cantidad: numeric({ precision: 12, scale: 4, mode: "number" }).notNull(),
}, (t) => [primaryKey({ columns: [t.bomId, t.materiaPrimaId] }), check("bom_cantidad", sql`${t.cantidad} > 0`)]);

export const ordenProduccion = pgTable("orden_produccion", {
  id: uuid().primaryKey().defaultRandom(),
  numero: serial().notNull().unique(),
  estado: text().notNull().default("abierta"),
  notaPedidoId: uuid().references(() => notaPedido.id),
  observacion: text(),
  creadaEn: ahora(),
  creadoPor: uuid().notNull().references(() => usuario.id),
  cerradaEn: timestamp({ withTimezone: true }),
  cerradoPor: uuid().references(() => usuario.id),
}, (t) => [check("orden_estado", sql`${t.estado} in ('abierta', 'cerrada', 'anulada')`)]);

export const ordenLinea = pgTable("orden_linea", {
  ordenId: uuid().notNull().references(() => ordenProduccion.id, { onDelete: "cascade" }),
  articuloId: uuid().notNull().references(() => articulo.id),
  cantidad: integer().notNull(),
}, (t) => [primaryKey({ columns: [t.ordenId, t.articuloId] }), check("orden_linea_cantidad", sql`${t.cantidad} > 0`)]);
