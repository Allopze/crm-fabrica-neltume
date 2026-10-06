// Stock por movimientos (ADR-0002; REQ-STK-2–5). Toda escritura pasa por registrarMovimientos.
import { and, asc, eq, gt, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo, bodega, madera, modelo, tipoPuerta } from "@/db/esquema/catalogo";
import { movimiento, type TipoMovimiento } from "@/db/esquema/inventario";
import { usuario } from "@/db/esquema/seguridad";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";

export interface NuevoMovimiento {
  articuloId?: string;
  materiaPrimaId?: string;
  tipo: TipoMovimiento;
  cantidad: number; // con signo según el tipo (DATA-MODEL §2)
  motivo?: string;
  refTipo?: string;
  refId?: string;
}

export interface Saldo { existencia: number; reservado: number; disponible: number }

async function bodegaPrincipal(tx: Tx): Promise<string> {
  const [b] = await tx.select({ id: bodega.id }).from(bodega).limit(1);
  if (!b) throw new ErrorDominio("INTERNO", "No hay bodega configurada");
  return b.id;
}

export async function saldo(tx: Tx, item: { articuloId?: string; materiaPrimaId?: string }): Promise<Saldo> {
  const campo = item.articuloId ? sql`articulo_id` : sql`materia_prima_id`;
  const id = item.articuloId ?? item.materiaPrimaId!;
  const { rows } = await tx.execute<{ existencia: string; reservado: string }>(
    sql`SELECT coalesce(sum(existencia), 0) AS existencia, coalesce(sum(reservado), 0) AS reservado FROM v_stock WHERE ${campo} = ${id}`,
  );
  const existencia = Number(rows[0].existencia);
  const reservado = Number(rows[0].reservado);
  return { existencia, reservado, disponible: existencia - reservado };
}

/**
 * Inserta movimientos en la transacción dada, serializando por ítem con un lock de transacción, y
 * rechaza el conjunto si algún ítem queda con existencia o disponible negativos (REQ-STK-4.2, 7.3).
 */
export async function registrarMovimientos(tx: Tx, movs: NuevoMovimiento[], actor: Actor & { id: string }, origen: Origen, idempotenciaClave?: string) {
  const bodegaId = await bodegaPrincipal(tx);
  const items = [...new Set(movs.map((m) => m.articuloId ?? m.materiaPrimaId!))].sort();
  for (const id of items) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

  const insertados = [];
  for (const [i, m] of movs.entries()) {
    const [fila] = await tx.insert(movimiento).values({
      bodegaId, articuloId: m.articuloId ?? null, materiaPrimaId: m.materiaPrimaId ?? null, tipo: m.tipo, cantidad: m.cantidad,
      motivo: m.motivo?.trim() || null, refTipo: m.refTipo ?? null, refId: m.refId ?? null,
      idempotenciaClave: idempotenciaClave ? `${idempotenciaClave}:${i}` : null, usuarioId: actor.id,
    }).returning();
    insertados.push(fila);
    await registrarAuditoria(tx, {
      actor, accion: m.tipo, recurso: m.articuloId ? "articulo" : "materia_prima", recursoId: m.articuloId ?? m.materiaPrimaId,
      despues: { movimiento: fila.id, cantidad: m.cantidad, motivo: m.motivo, ref: m.refTipo ? `${m.refTipo}:${m.refId ?? ""}` : undefined },
      resultado: "ok", origen,
    });
  }

  for (const m of movs) {
    const s = await saldo(tx, m);
    if (s.existencia < 0 || s.disponible < 0) {
      throw new ErrorDominio("STOCK_INSUFICIENTE", "No hay stock suficiente para este movimiento.", { ...s, faltante: -Math.min(s.existencia, s.disponible) });
    }
  }
  return insertados;
}

export async function articuloPorCodigo(tx: Tx, codigo: string) {
  const [a] = await tx.select().from(articulo).where(eq(articulo.codigo, codigo.trim().toUpperCase()));
  if (!a) throw new ErrorDominio("NO_ENCONTRADO", `No existe el artículo ${codigo}`);
  return a;
}

export interface FiltroStock { q?: string; madera?: string; tipo?: string; bajoMinimo?: boolean; cursor?: string; limite?: number }

/** Artículos con movimientos o mínimo definido (o todos si se busca), con su saldo. */
export async function listarStock(tx: Tx, f: FiltroStock) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const s = sql`(SELECT articulo_id, sum(existencia) AS existencia, sum(reservado) AS reservado FROM v_stock WHERE articulo_id IS NOT NULL GROUP BY articulo_id)`;
  const existencia = sql<number>`coalesce(s.existencia, 0)::int`;
  const reservado = sql<number>`coalesce(s.reservado, 0)::int`;
  const condiciones = [];
  if (f.q) condiciones.push(or(ilike(articulo.codigo, `%${f.q}%`), ilike(modelo.nombre, `%${f.q}%`)));
  else condiciones.push(or(sql`s.articulo_id IS NOT NULL`, isNotNull(articulo.stockMinimo)));
  if (f.madera) condiciones.push(eq(madera.codigo, f.madera.toUpperCase()));
  if (f.tipo) condiciones.push(eq(tipoPuerta.nombre, f.tipo.toUpperCase()));
  if (f.bajoMinimo) condiciones.push(sql`${articulo.stockMinimo} IS NOT NULL AND coalesce(s.existencia, 0) - coalesce(s.reservado, 0) < ${articulo.stockMinimo}`);
  if (f.cursor) condiciones.push(gt(articulo.codigo, f.cursor));

  const filas = await tx
    .select({
      codigo: articulo.codigo, modelo: modelo.nombre, madera: madera.nombre, maderaCodigo: madera.codigo, ancho: articulo.anchoEtiqueta,
      altoM: articulo.altoM, tipo: tipoPuerta.nombre, minimo: articulo.stockMinimo, existencia, reservado,
    })
    .from(articulo)
    .innerJoin(modelo, eq(modelo.id, articulo.modeloId))
    .innerJoin(madera, eq(madera.id, articulo.maderaId))
    .leftJoin(tipoPuerta, eq(tipoPuerta.id, articulo.tipoPuertaId))
    .leftJoin(sql`${s} AS s`, sql`s.articulo_id = ${articulo.id}`)
    .where(and(eq(articulo.activo, true), ...condiciones))
    .orderBy(asc(articulo.codigo))
    .limit(limite + 1);
  const datos = filas.slice(0, limite).map((x) => ({ ...x, disponible: x.existencia - x.reservado }));
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.codigo : null };
}

export async function movimientosDe(tx: Tx, articuloId: string, limite = 50) {
  return tx
    .select({ id: movimiento.id, ocurridoEn: movimiento.ocurridoEn, tipo: movimiento.tipo, cantidad: movimiento.cantidad, motivo: movimiento.motivo,
      refTipo: movimiento.refTipo, refId: movimiento.refId, usuario: usuario.nombre })
    .from(movimiento)
    .innerJoin(usuario, eq(usuario.id, movimiento.usuarioId))
    .where(eq(movimiento.articuloId, articuloId))
    .orderBy(sql`${movimiento.ocurridoEn} DESC`)
    .limit(limite);
}
