// Consultas de puertas e historial de despachos (REQ-STK-8.6, 10.2). Solo lectura.
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { ErrorDominio } from "../errores";
import { normalizarCodigo } from "./puertas";

export const ESTADOS_FILTRO = ["stock", "disponibles", "apartadas", "fuera", "todas"] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export interface FiltroPuertas {
  q?: string; ubicacion?: string; calidad?: string; estado?: EstadoFiltro; articulo?: string; fueraCatalogo?: boolean; cursor?: string; limite?: number;
}

export type PuertaListada = {
  codigo: string; articulo: string; modelo: string; madera: string; ancho: string; altoM: number; anchoMm: number | null; altoMm: number | null;
  ubicacion: string; calidad: string; observacion: string | null; fechaProduccion: string | null; fueraCatalogo: boolean;
  existencia: number; apartada: number; apartadaPara: string | null; salida: string | null;
};

// Columnas comunes de la lista y la ficha. `salida`: tipo del último movimiento de existencia (despacho o ajuste).
const columnas = (verClientes: boolean) => sql`
  p.codigo, a.codigo AS articulo, mo.nombre AS modelo, ma.nombre AS madera, a.ancho_etiqueta AS ancho, a.alto_m::float AS "altoM",
  p.ancho_mm AS "anchoMm", p.alto_mm AS "altoMm", p.ubicacion, p.calidad, p.observacion, p.fecha_produccion::text AS "fechaProduccion",
  a.fuera_catalogo AS "fueraCatalogo", v.existencia, v.apartada,
  CASE WHEN v.apartada = 1 THEN ${verClientes
    ? sql`(SELECT m.motivo FROM movimiento m WHERE m.puerta_id = p.id AND m.tipo = 'reserva' ORDER BY m.ocurrido_en DESC LIMIT 1)`
    : sql`'Apartada'`} END AS "apartadaPara",
  CASE WHEN v.existencia = 0 THEN (SELECT m.tipo FROM movimiento m WHERE m.puerta_id = p.id AND m.tipo NOT IN ('reserva', 'liberacion')
    ORDER BY m.ocurrido_en DESC LIMIT 1) END AS salida`;

const desde = sql`FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id JOIN articulo a ON a.id = p.articulo_id
  JOIN modelo mo ON mo.id = a.modelo_id JOIN madera ma ON ma.id = a.madera_id`;

export async function listarPuertas(tx: Tx, f: FiltroPuertas, verClientes: boolean) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const c: SQL[] = [];
  const estado = f.estado ?? "stock";
  if (estado === "stock") c.push(sql`v.existencia = 1`);
  if (estado === "disponibles") c.push(sql`v.existencia = 1 AND v.apartada = 0`);
  if (estado === "apartadas") c.push(sql`v.apartada = 1`);
  if (estado === "fuera") c.push(sql`v.existencia = 0`);
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    c.push(sql`(p.codigo ILIKE ${q} OR a.codigo ILIKE ${q} OR mo.nombre ILIKE ${q} OR p.observacion ILIKE ${q})`);
  }
  if (f.ubicacion) c.push(sql`p.ubicacion = ${f.ubicacion}`);
  if (f.calidad) c.push(sql`p.calidad = ${f.calidad}`);
  if (f.articulo) c.push(sql`a.codigo = ${normalizarCodigo(f.articulo)}`);
  if (f.fueraCatalogo !== undefined) c.push(sql`a.fuera_catalogo = ${f.fueraCatalogo}`);
  if (f.cursor) c.push(sql`p.codigo > ${f.cursor}`);
  const donde = c.length ? sql`WHERE ${sql.join(c, sql` AND `)}` : sql``;
  const { rows } = await tx.execute<PuertaListada>(sql`SELECT ${columnas(verClientes)} ${desde} ${donde} ORDER BY p.codigo LIMIT ${limite + 1}`);
  const datos = rows.slice(0, limite);
  return { datos, siguiente: rows.length > limite ? datos.at(-1)!.codigo : null };
}

/** Ubicaciones en uso, las más frecuentes primero (filtros y sugerencias). */
export async function ubicaciones(tx: Tx): Promise<string[]> {
  const { rows } = await tx.execute<{ ubicacion: string }>(sql`SELECT ubicacion FROM puerta GROUP BY ubicacion ORDER BY count(*) DESC, ubicacion`);
  return rows.map((r) => r.ubicacion);
}

/** Ficha de una puerta: datos, movimientos y despacho histórico (REQ-STK-8.6). */
export async function obtenerPuerta(tx: Tx, codigo: string, verClientes: boolean) {
  const cod = normalizarCodigo(codigo);
  const { rows } = await tx.execute<PuertaListada>(sql`SELECT ${columnas(verClientes)} ${desde} WHERE p.codigo = ${cod}`);
  if (!rows[0]) throw new ErrorDominio("NO_ENCONTRADO", `No existe la puerta ${cod}.`);
  const movimientos = await tx.execute<{ id: string; ocurridoEn: string; tipo: string; cantidad: number; motivo: string | null; refTipo: string | null; refId: string | null; refNumero: number | null; usuario: string }>(sql`
    SELECT m.id, m.ocurrido_en AS "ocurridoEn", m.tipo, m.cantidad::int AS cantidad,
      CASE WHEN m.tipo = 'reserva' AND NOT ${verClientes} THEN 'Apartada' ELSE m.motivo END AS motivo,
      m.ref_tipo AS "refTipo", m.ref_id AS "refId", u.nombre AS usuario,
      CASE m.ref_tipo WHEN 'pedido' THEN (SELECT n.numero FROM nota_pedido n WHERE n.id::text = m.ref_id)
        WHEN 'orden' THEN CASE WHEN m.ref_id ~ '^[0-9]+$' THEN m.ref_id::int END END AS "refNumero"
    FROM movimiento m JOIN usuario u ON u.id = m.usuario_id JOIN puerta p ON p.id = m.puerta_id
    WHERE p.codigo = ${cod} ORDER BY m.ocurrido_en DESC, m.tipo`);
  const historico = await listarHistorico(tx, { codigo: cod, limite: 20 }, verClientes);
  return { ...rows[0], movimientos: movimientos.rows, historico: historico.datos };
}

export interface FiltroHistorico { q?: string; codigo?: string; cursor?: string; limite?: number }
export type FilaHistorico = {
  id: string; fila: number; codigo: string | null; modelo: string | null; medida: string | null; madera: string | null; fechaProduccion: string | null;
  fechaTexto: string | null; estado: string | null; cliente: string | null; documento: string | null; nota: string | null; dudas: string[];
};

/** Historial de despachos de la planilla, de lo último a lo primero. El cliente, solo con `clientes.ver` (REQ-STK-10.2). */
export async function listarHistorico(tx: Tx, f: FiltroHistorico, verClientes: boolean) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const c: SQL[] = [];
  if (f.codigo) c.push(sql`h.codigo = ${normalizarCodigo(f.codigo)}`);
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    c.push(verClientes
      ? sql`(h.codigo ILIKE ${q} OR h.documento ILIKE ${q} OR h.modelo ILIKE ${q} OR h.cliente ILIKE ${q})`
      : sql`(h.codigo ILIKE ${q} OR h.documento ILIKE ${q} OR h.modelo ILIKE ${q})`);
  }
  const cursor = /^(\d+)_([0-9a-f-]{36})$/.exec(f.cursor ?? "");
  if (cursor) c.push(sql`(h.fila, h.id) < (${Number(cursor[1])}, ${cursor[2]}::uuid)`);
  const donde = c.length ? sql`WHERE ${sql.join(c, sql` AND `)}` : sql``;
  const { rows } = await tx.execute<FilaHistorico>(sql`
    SELECT h.id, h.fila, h.codigo, h.modelo, h.medida, h.madera, h.fecha_produccion::text AS "fechaProduccion", h.fecha_texto AS "fechaTexto",
      h.estado, ${verClientes ? sql`h.cliente` : sql`NULL`} AS cliente, h.documento, h.nota, h.dudas
    FROM despacho_historico h ${donde} ORDER BY h.fila DESC, h.id DESC LIMIT ${limite + 1}`);
  const datos = rows.slice(0, limite);
  return { datos, siguiente: rows.length > limite ? `${datos.at(-1)!.fila}_${datos.at(-1)!.id}` : null };
}

/** Códigos de las puertas que entraron al cerrar una orden (para anotarlos en sus etiquetas, REQ-STK-8.2). */
export async function puertasDeOrden(tx: Tx, numero: number): Promise<string[]> {
  const { rows } = await tx.execute<{ codigo: string }>(sql`
    SELECT p.codigo FROM movimiento m JOIN puerta p ON p.id = m.puerta_id
     WHERE m.ref_tipo = 'orden' AND m.ref_id = ${String(numero)} AND m.tipo = 'entrada_produccion' ORDER BY p.codigo`);
  return rows.map((r) => r.codigo);
}

export type OpcionDespacho = { codigo: string; ubicacion: string; calidad: string; observacion: string | null };

/** Puertas en stock y sin apartar de cada artículo de puertas, en el orden en que saldrían solas (REQ-STK-8.3). */
export async function opcionesDeDespacho(tx: Tx, articuloIds: string[]): Promise<Map<string, OpcionDespacho[]>> {
  const mapa = new Map<string, OpcionDespacho[]>();
  if (!articuloIds.length) return mapa;
  const { rows } = await tx.execute<OpcionDespacho & { articuloId: string }>(sql`
    SELECT p.articulo_id AS "articuloId", p.codigo, p.ubicacion, p.calidad, p.observacion
      FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id
     WHERE p.articulo_id IN (${sql.join(articuloIds.map((id) => sql`${id}`), sql`, `)}) AND v.existencia = 1 AND v.apartada = 0
     ORDER BY p.calidad = 'segunda', p.fecha_produccion ASC NULLS LAST, p.creado_en ASC, p.codigo ASC`);
  // Solo las puertas se eligen; un accesorio (marco, moldura) sale por cantidad y no aparece aquí.
  const deFamilia = await tx.execute<{ id: string }>(sql`SELECT a.id FROM articulo a JOIN modelo m ON m.id = a.modelo_id
    WHERE a.id IN (${sql.join(articuloIds.map((id) => sql`${id}`), sql`, `)}) AND m.familia = 'puerta'`);
  for (const { id } of deFamilia.rows) mapa.set(id, []);
  for (const { articuloId, ...o } of rows) mapa.set(articuloId, [...(mapa.get(articuloId) ?? []), o]);
  return mapa;
}
