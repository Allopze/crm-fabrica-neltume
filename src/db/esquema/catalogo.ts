// Catálogo, bodegas, parámetros y precios versionados (DATA-MODEL §2; REQ-STK-1, REQ-COT-1).
import { sql } from "drizzle-orm";
import {
  boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { usuario } from "./seguridad";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const dinero = () => numeric({ precision: 14, scale: 4, mode: "number" });

export const modelo = pgTable("modelo", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(),
  codigo: text().notNull().unique(),
  familia: text().notNull(), // puerta | accesorio
  activo: boolean().notNull().default(true),
}, (t) => [check("modelo_familia", sql`${t.familia} in ('puerta', 'accesorio')`)]);

export const madera = pgTable("madera", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(), // normalizado sin tildes: PINO OREGON, LENGA, MARA, RAULI
  codigo: text().notNull().unique(), // O, L, M, R
});

/** Rangos de ancho de puertas (1–9). La IA y el mapeo exacto usan min/max. */
export const rangoAncho = pgTable("rango_ancho", {
  codigo: text().primaryKey(),
  etiqueta: text().notNull(),
  minM: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
  maxM: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
});

/** Altos de puertas (A–G = 2,00–2,60 m). */
export const alto = pgTable("alto", {
  codigo: text().primaryKey(),
  altoM: numeric({ precision: 4, scale: 2, mode: "number" }).notNull().unique(),
});

export const tipoPuerta = pgTable("tipo_puerta", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(), // BLOQUE, PANEL, ESPECIAL
});

export const articulo = pgTable("articulo", {
  id: uuid().primaryKey().defaultRandom(),
  codigo: text().notNull().unique(),
  modeloId: uuid().notNull().references(() => modelo.id),
  maderaId: uuid().notNull().references(() => madera.id),
  anchoCodigo: text().notNull(), // 1–9 en puertas; 2X4, 6X1… en accesorios
  anchoEtiqueta: text().notNull(),
  altoCodigo: text().notNull(),
  altoM: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(), // alto o largo
  espesor: numeric({ precision: 4, scale: 1, mode: "number" }),
  pulgadas: numeric({ precision: 10, scale: 4, mode: "number" }),
  tipoPuertaId: uuid().references(() => tipoPuerta.id),
  stockMinimo: integer(),
  activo: boolean().notNull().default(true),
  actualizadoEn: ahora(),
}, (t) => [
  uniqueIndex("articulo_variante_uk").on(t.modeloId, t.maderaId, t.anchoCodigo, t.altoCodigo),
  check("articulo_minimo", sql`${t.stockMinimo} IS NULL OR ${t.stockMinimo} >= 0`),
]);

export const bodega = pgTable("bodega", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(),
});

export const parametro = pgTable("parametro", {
  clave: text().primaryKey(),
  valor: jsonb().notNull(),
});

export const feriado = pgTable("feriado", {
  fecha: date({ mode: "string" }).primaryKey(),
  nombre: text().notNull(),
});

// --- Precios versionados ---
export const listaPrecio = pgTable("lista_precio", {
  id: uuid().primaryKey().defaultRandom(),
  version: serial().notNull().unique(),
  origen: text().notNull(), // excel | edicion
  archivoHash: text(),
  descripcion: text().notNull(),
  vigente: boolean().notNull().default(false),
  creadoPor: uuid().references(() => usuario.id),
  creadoEn: ahora(),
}, (t) => [
  check("lista_origen", sql`${t.origen} in ('excel', 'edicion')`),
  uniqueIndex("lista_una_vigente").on(t.vigente).where(sql`${t.vigente}`),
]);

export const precio = pgTable("precio", {
  listaId: uuid().notNull().references(() => listaPrecio.id),
  articuloId: uuid().notNull().references(() => articulo.id),
  costoProduccion: dinero(),
  costoMateriales: dinero(),
  costoInsumos: dinero(),
  costosGenerales: dinero(),
  costoTotal: dinero(),
  margen: numeric({ precision: 6, scale: 4, mode: "number" }),
  precioNeto: dinero().notNull(),
}, (t) => [
  primaryKey({ columns: [t.listaId, t.articuloId] }),
  check("precio_positivo", sql`${t.precioNeto} > 0`),
]);

/** Recargo por tipo de puerta, por versión de lista. tipo_puerta_id NULL = accesorios. */
export const recargoTipo = pgTable("recargo_tipo", {
  id: uuid().primaryKey().defaultRandom(),
  listaId: uuid().notNull().references(() => listaPrecio.id),
  tipoPuertaId: uuid().references(() => tipoPuerta.id),
  porcentaje: numeric({ precision: 6, scale: 4, mode: "number" }).notNull(),
}, (t) => [
  unique("recargo_lista_tipo_uk").on(t.listaId, t.tipoPuertaId).nullsNotDistinct(),
  check("recargo_rango", sql`${t.porcentaje} >= 0 AND ${t.porcentaje} < 5`),
]);

export const importacion = pgTable("importacion", {
  id: uuid().primaryKey().defaultRandom(),
  archivoHash: text().notNull(),
  nombreArchivo: text().notNull(),
  listaId: uuid().references(() => listaPrecio.id),
  creadas: integer().notNull(),
  actualizadas: integer().notNull(),
  sinCambios: integer().notNull(),
  rechazadas: integer().notNull(),
  rechazos: jsonb().notNull(), // [{ fila, motivo }] — sin valores de costo ni precio
  creadoPor: uuid().references(() => usuario.id),
  creadoEn: ahora(),
}, (t) => [index("importacion_hash_idx").on(t.archivoHash)]);
