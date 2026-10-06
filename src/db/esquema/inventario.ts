// Movimientos de inventario inmutables (ADR-0002, DATA-MODEL §2). El saldo nunca se guarda: es la vista v_stock.
import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { articulo, bodega } from "./catalogo";
import { materiaPrima } from "./produccion";
import { usuario } from "./seguridad";

export const TIPOS_MOVIMIENTO = ["entrada_produccion", "recepcion", "salida_despacho", "consumo_produccion", "ajuste", "reserva", "liberacion"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const movimiento = pgTable("movimiento", {
  id: uuid().primaryKey().defaultRandom(),
  ocurridoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  bodegaId: uuid().notNull().references(() => bodega.id),
  articuloId: uuid().references(() => articulo.id),
  materiaPrimaId: uuid().references(() => materiaPrima.id),
  tipo: text().notNull(),
  cantidad: numeric({ precision: 12, scale: 3, mode: "number" }).notNull(),
  motivo: text(),
  refTipo: text(), // orden | pedido | recepcion | conteo …
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
  index("mov_articulo_idx").on(t.articuloId, t.bodegaId),
  index("mov_mp_idx").on(t.materiaPrimaId, t.bodegaId),
  index("mov_ref_idx").on(t.refTipo, t.refId),
]);
