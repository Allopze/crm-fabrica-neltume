// Puertas físicas (ADR-0018, REQ-STK-8): códigos, creación y elección. Su existencia sale de los movimientos
// (vista v_puerta); aquí nunca se escribe un saldo. Los movimientos los inserta stock.registrarMovimientos.
import { inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { ORIGENES_PUERTA, puerta } from "@/db/esquema/inventario";
import { ErrorDominio } from "../errores";
import { normalizarUbicacion } from "./normalizar";

/** Primer código que genera la app: por encima de toda etiqueta que la fábrica ya usó (202308000000xxx). */
export const CODIGO_INICIAL = BigInt("202308000010001");

export type OrigenPuerta = (typeof ORIGENES_PUERTA)[number];
export interface DatosPuertaNueva {
  ubicacion?: string;
  calidad?: "primera" | "segunda";
  observacion?: string | null;
  fechaProduccion?: string | null;
  anchoMm?: number | null;
  altoMm?: number | null;
  origen?: OrigenPuerta;
}

export interface EstadoPuerta { id: string; codigo: string; articuloId: string; existencia: number; apartada: number }

export const normalizarCodigo = (c: string) => c.trim().toUpperCase();

/** Los siguientes `n` códigos de la serie. El lock de transacción evita que dos operaciones tomen el mismo. */
export async function siguientesCodigos(tx: Tx, n: number): Promise<string[]> {
  if (n <= 0) return [];
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('puerta_codigo'))`);
  const { rows } = await tx.execute<{ max: string | null }>(sql`SELECT max(codigo::bigint)::text AS max FROM puerta WHERE codigo ~ '^[0-9]{15}$'`);
  const despues = rows[0].max ? BigInt(rows[0].max) + BigInt(1) : BigInt(0);
  const base = despues > CODIGO_INICIAL ? despues : CODIGO_INICIAL;
  return Array.from({ length: n }, (_, i) => String(base + BigInt(i)));
}

/** Crea las filas de puerta (sin movimientos). Rechaza un código repetido. */
export async function crearPuertas(tx: Tx, articuloId: string, codigos: string[], d: DatosPuertaNueva, creadoPor: string) {
  if (!codigos.length) return [];
  const filas = await tx.insert(puerta).values(codigos.map((codigo) => ({
    codigo, articuloId, ubicacion: normalizarUbicacion(d.ubicacion), calidad: d.calidad ?? "primera", observacion: d.observacion?.trim() || null,
    fechaProduccion: d.fechaProduccion ?? null, anchoMm: d.anchoMm ?? null, altoMm: d.altoMm ?? null, origen: d.origen ?? "manual", creadoPor,
  }))).onConflictDoNothing({ target: puerta.codigo }).returning({ id: puerta.id, codigo: puerta.codigo });
  if (filas.length !== codigos.length) {
    const creados = new Set(filas.map((f) => f.codigo));
    throw new ErrorDominio("VALIDACION", "Ya existe una puerta con ese código.", { codigos: codigos.filter((c) => !creados.has(c)) });
  }
  return filas;
}

/** Estado actual de las puertas indicadas (existencia y apartado, 0 o 1), en el orden pedido. */
export async function estadoDe(tx: Tx, codigos: string[]): Promise<EstadoPuerta[]> {
  if (!codigos.length) return [];
  const { rows } = await tx.execute<{ id: string; codigo: string; articulo_id: string; existencia: number; apartada: number }>(sql`
    SELECT p.id, p.codigo, p.articulo_id, v.existencia, v.apartada FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id
     WHERE p.codigo IN (${sql.join(codigos.map((c) => sql`${c}`), sql`, `)})`);
  const porCodigo = new Map(rows.map((r) => [r.codigo, { id: r.id, codigo: r.codigo, articuloId: r.articulo_id, existencia: Number(r.existencia), apartada: Number(r.apartada) }]));
  const faltan = codigos.filter((c) => !porCodigo.has(c));
  if (faltan.length) throw new ErrorDominio("NO_ENCONTRADO", faltan.length === 1 ? `No existe la puerta ${faltan[0]}.` : `No existen las puertas ${faltan.join(", ")}.`, { codigos: faltan });
  return codigos.map((c) => porCodigo.get(c)!);
}

/** Las `n` puertas más antiguas del artículo en stock y sin apartar, primero las de primera (REQ-STK-8.3). Puede devolver menos. */
export async function puertasLibres(tx: Tx, articuloId: string, n: number, excluir: string[] = []): Promise<EstadoPuerta[]> {
  const sinEstas = excluir.length ? sql`AND p.id NOT IN (${sql.join(excluir.map((id) => sql`${id}`), sql`, `)})` : sql``;
  const { rows } = await tx.execute<{ id: string; codigo: string }>(sql`
    SELECT p.id, p.codigo FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id
     WHERE p.articulo_id = ${articuloId} AND v.existencia = 1 AND v.apartada = 0 ${sinEstas}
     ORDER BY p.calidad = 'segunda', p.fecha_produccion ASC NULLS LAST, p.creado_en ASC, p.codigo ASC
     LIMIT ${n}`);
  return rows.map((r) => ({ id: r.id, codigo: r.codigo, articuloId, existencia: 1, apartada: 0 }));
}

/** Artículo de cada puerta, para agrupar una salida o un ajuste indicados solo por código. */
export async function articulosDe(tx: Tx, codigos: string[]): Promise<Map<string, string>> {
  if (!codigos.length) return new Map();
  const filas = await tx.select({ codigo: puerta.codigo, articuloId: puerta.articuloId }).from(puerta).where(inArray(puerta.codigo, codigos));
  return new Map(filas.map((f) => [f.codigo, f.articuloId]));
}
