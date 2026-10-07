// Stock por movimientos (ADR-0002; REQ-STK-2–5). Toda escritura pasa por registrarMovimientos.
import { and, asc, eq, gt, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo, bodega, madera, modelo, tipoPuerta } from "@/db/esquema/catalogo";
import { notaPedido } from "@/db/esquema/comercial";
import { movimiento, puerta, type TipoMovimiento } from "@/db/esquema/inventario";
import { ordenProduccion } from "@/db/esquema/produccion";
import { usuario } from "@/db/esquema/seguridad";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";
import { type DatosPuertaNueva, type EstadoPuerta, articulosDe, crearPuertas, estadoDe, normalizarCodigo, puertasLibres, siguientesCodigos } from "./puertas/puertas";

export interface NuevoMovimiento {
  articuloId?: string;
  materiaPrimaId?: string;
  tipo: TipoMovimiento;
  cantidad: number; // con signo según el tipo (DATA-MODEL §2)
  motivo?: string;
  refTipo?: string;
  refId?: string;
  /** Códigos de las puertas que entran o salen (o que se apartan/liberan); sin ellos se generan o se eligen las más antiguas (ADR-0018). */
  puertas?: string[];
  /** Datos de las puertas nuevas que crea una entrada. */
  datosPuerta?: DatosPuertaNueva;
}

export type MovimientoInsertado = typeof movimiento.$inferSelect & { puertaCodigo: string | null };
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

type Fila = { puertaId?: string; puertaCodigo?: string; tipo?: TipoMovimiento; cantidad: number; motivo?: string };

function codigosUnicos(m: NuevoMovimiento, n: number): string[] {
  const codigos = (m.puertas ?? []).map(normalizarCodigo);
  if (new Set(codigos).size !== codigos.length) throw new ErrorDominio("VALIDACION", "Una puerta aparece dos veces.");
  if (codigos.length !== n) throw new ErrorDominio("VALIDACION", `Indica ${n === 1 ? "1 puerta" : `${n} puertas`}: se indicaron ${codigos.length}.`);
  return codigos;
}

function delArticulo(p: EstadoPuerta, articuloId: string) {
  if (p.articuloId !== articuloId) throw new ErrorDominio("VALIDACION", `La puerta ${p.codigo} es de otro artículo.`, { codigo: p.codigo });
}

/** Una puerta por fila (REQ-STK-8.1–8.3, 8.5): entrada → puertas nuevas o que vuelven; salida → las indicadas o las más antiguas. */
async function filasDePuertas(tx: Tx, m: NuevoMovimiento, actorId: string): Promise<Fila[]> {
  const articuloId = m.articuloId!;
  if (!Number.isInteger(m.cantidad)) throw new ErrorDominio("VALIDACION", "Las puertas se mueven en unidades enteras.");
  const n = Math.abs(m.cantidad);
  const signo = Math.sign(m.cantidad);

  if (m.tipo === "reserva" || m.tipo === "liberacion") { // apartado de puertas puntuales
    const puertas = await estadoDe(tx, codigosUnicos(m, n));
    for (const p of puertas) {
      delArticulo(p, articuloId);
      if (m.tipo === "reserva" && (p.existencia !== 1 || p.apartada !== 0)) throw new ErrorDominio("STOCK_INSUFICIENTE", `La puerta ${p.codigo} no está disponible para apartar.`, { codigo: p.codigo });
      if (m.tipo === "liberacion" && p.apartada !== 1) throw new ErrorDominio("VALIDACION", `La puerta ${p.codigo} no está apartada.`, { codigo: p.codigo });
    }
    return puertas.map((p) => ({ puertaId: p.id, puertaCodigo: p.codigo, cantidad: signo }));
  }

  if (signo > 0) {
    const codigos = m.puertas?.length ? codigosUnicos(m, n) : await siguientesCodigos(tx, n);
    const existentes = await articulosDe(tx, codigos);
    const vuelven = await estadoDe(tx, codigos.filter((c) => existentes.has(c)));
    for (const p of vuelven) {
      delArticulo(p, articuloId);
      if (p.existencia !== 0) throw new ErrorDominio("VALIDACION", `La puerta ${p.codigo} ya está en stock.`, { codigo: p.codigo });
    }
    const origen = m.datosPuerta?.origen ?? (m.refTipo === "orden" ? "produccion" : "manual");
    const nuevas = await crearPuertas(tx, articuloId, codigos.filter((c) => !existentes.has(c)), { ...m.datosPuerta, origen }, actorId);
    const id = new Map([...vuelven, ...nuevas].map((p) => [p.codigo, p.id]));
    return codigos.map((c) => ({ puertaId: id.get(c)!, puertaCodigo: c, cantidad: 1 }));
  }

  if (m.puertas?.length) {
    const puertas = await estadoDe(tx, codigosUnicos(m, n));
    const filas: Fila[] = [];
    for (const p of puertas) {
      delArticulo(p, articuloId);
      if (p.existencia !== 1) throw new ErrorDominio("STOCK_INSUFICIENTE", `La puerta ${p.codigo} no está en stock.`, { codigo: p.codigo, faltante: 1 });
      // Elegir una puerta apartada para que salga la libera en la misma operación (ADR-0018 §4).
      if (p.apartada === 1) filas.push({ puertaId: p.id, puertaCodigo: p.codigo, tipo: "liberacion", cantidad: -1, motivo: "Sale de stock" });
      filas.push({ puertaId: p.id, puertaCodigo: p.codigo, cantidad: -1 });
    }
    return filas;
  }
  const libres = await puertasLibres(tx, articuloId, n);
  if (libres.length < n) {
    const s = await saldo(tx, { articuloId });
    throw new ErrorDominio("STOCK_INSUFICIENTE", "No hay stock suficiente para este movimiento.", { ...s, faltante: n - libres.length });
  }
  return libres.map((p) => ({ puertaId: p.id, puertaCodigo: p.codigo, cantidad: -1 }));
}

/** Artículos de familia «puerta»: se mueven puerta por puerta. Los accesorios (marcos, molduras) siguen por cantidad. */
async function sonPuertas(tx: Tx, articuloIds: string[]): Promise<Set<string>> {
  if (!articuloIds.length) return new Set();
  const filas = await tx.select({ id: articulo.id }).from(articulo).innerJoin(modelo, eq(modelo.id, articulo.modeloId))
    .where(and(inArray(articulo.id, [...new Set(articuloIds)]), eq(modelo.familia, "puerta")));
  return new Set(filas.map((f) => f.id));
}

/**
 * Inserta movimientos en la transacción dada, serializando por ítem con un lock de transacción, y
 * rechaza el conjunto si algún ítem queda con existencia o disponible negativos (REQ-STK-4.2, 7.3).
 * Las entradas, salidas y ajustes de una puerta se registran puerta por puerta (ADR-0018). Con `auditar: false`
 * el llamador registra él mismo un resumen (carga inicial, REQ-STK-9.4).
 */
export async function registrarMovimientos(
  tx: Tx, movs: NuevoMovimiento[], actor: Actor & { id: string }, origen: Origen, idempotenciaClave?: string, opciones: { auditar?: boolean } = {},
): Promise<MovimientoInsertado[]> {
  const bodegaId = await bodegaPrincipal(tx);
  const items = [...new Set(movs.map((m) => m.articuloId ?? m.materiaPrimaId!))].sort();
  for (const id of items) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

  const puertas = await sonPuertas(tx, movs.flatMap((m) => (m.articuloId ? [m.articuloId] : [])));
  const insertados: MovimientoInsertado[] = [];
  for (const m of movs) {
    if (m.articuloId && !puertas.has(m.articuloId) && m.puertas?.length) throw new ErrorDominio("VALIDACION", "Los accesorios se mueven por cantidad, sin etiquetas.");
    const porPuerta = m.articuloId && puertas.has(m.articuloId) && (m.puertas?.length || !["reserva", "liberacion"].includes(m.tipo));
    const filas: Fila[] = porPuerta ? await filasDePuertas(tx, m, actor.id) : [{ cantidad: m.cantidad }];
    const desde = insertados.length;
    for (const f of filas) {
      const i = insertados.length;
      const [fila] = await tx.insert(movimiento).values({
        bodegaId, articuloId: m.articuloId ?? null, materiaPrimaId: m.materiaPrimaId ?? null, puertaId: f.puertaId ?? null,
        tipo: f.tipo ?? m.tipo, cantidad: f.cantidad, motivo: (f.motivo ?? m.motivo)?.trim() || null, refTipo: m.refTipo ?? null, refId: m.refId ?? null,
        idempotenciaClave: idempotenciaClave ? `${idempotenciaClave}:${i}` : null, usuarioId: actor.id,
      }).returning();
      insertados.push({ ...fila, puertaCodigo: f.puertaCodigo ?? null });
    }
    if (opciones.auditar === false) continue;
    const codigos = [...new Set(insertados.slice(desde).flatMap((x) => (x.puertaCodigo ? [x.puertaCodigo] : [])))];
    await registrarAuditoria(tx, {
      actor, accion: m.tipo, recurso: m.articuloId ? "articulo" : "materia_prima", recursoId: m.articuloId ?? m.materiaPrimaId,
      despues: { movimiento: insertados[desde]?.id, cantidad: m.cantidad, motivo: m.motivo, ref: m.refTipo ? `${m.refTipo}:${m.refId ?? ""}` : undefined, ...(codigos.length ? { puertas: codigos } : {}) },
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

/** Agrupa por artículo puertas indicadas solo por código (salida o ajuste desde la ficha de una puerta). */
export async function porArticulo(tx: Tx, codigos: string[], articuloPorDefecto?: string): Promise<Map<string, string[]>> {
  const normal = codigos.map(normalizarCodigo);
  const de = await articulosDe(tx, normal);
  const grupos = new Map<string, string[]>();
  for (const c of normal) {
    if (articuloPorDefecto && de.has(c) && de.get(c) !== articuloPorDefecto) throw new ErrorDominio("VALIDACION", `La puerta ${c} es de otro artículo.`, { codigo: c });
    const a = de.get(c) ?? articuloPorDefecto;
    if (!a) throw new ErrorDominio("NO_ENCONTRADO", `No existe la puerta ${c}; para una puerta nueva indica su artículo.`, { codigos: [c] });
    grupos.set(a, [...(grupos.get(a) ?? []), c]);
  }
  return grupos;
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
      altoM: articulo.altoM, tipo: tipoPuerta.nombre, minimo: articulo.stockMinimo, fueraCatalogo: articulo.fueraCatalogo, existencia, reservado,
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

/** Movimientos de un artículo, con el número del documento de referencia (nota de pedido u orden) para mostrarlo en vez del id. */
export async function movimientosDe(tx: Tx, articuloId: string, limite = 50) {
  return tx
    .select({ id: movimiento.id, ocurridoEn: movimiento.ocurridoEn, tipo: movimiento.tipo, cantidad: movimiento.cantidad, motivo: movimiento.motivo,
      refTipo: movimiento.refTipo, refId: movimiento.refId, usuario: usuario.nombre, puerta: puerta.codigo,
      refNumero: sql<number | null>`CASE ${movimiento.refTipo}
        WHEN 'pedido' THEN (SELECT ${notaPedido.numero} FROM ${notaPedido} WHERE ${notaPedido.id}::text = ${movimiento.refId})
        WHEN 'orden' THEN CASE WHEN ${movimiento.refId} ~ '^[0-9]+$' THEN ${movimiento.refId}::int
          ELSE (SELECT ${ordenProduccion.numero} FROM ${ordenProduccion} WHERE ${ordenProduccion.id}::text = ${movimiento.refId}) END
      END` })
    .from(movimiento)
    .innerJoin(usuario, eq(usuario.id, movimiento.usuarioId))
    .leftJoin(puerta, eq(puerta.id, movimiento.puertaId))
    .where(eq(movimiento.articuloId, articuloId))
    .orderBy(sql`${movimiento.ocurridoEn} DESC`)
    .limit(limite);
}
