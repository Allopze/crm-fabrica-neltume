// Lectura de cotizaciones (REQ-COT-2.6, 3.1, 6.3, 10). Avisos de stock calculados al leer, nunca guardados.
import { and, asc, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { listaPrecio, parametro } from "@/db/esquema/catalogo";
import { cliente, cotizacion, cotizacionItem, notaPedido } from "@/db/esquema/comercial";
import { usuario } from "@/db/esquema/seguridad";
import { ErrorDominio } from "../errores";
import { hoySantiago } from "../precios/dias-habiles";
import { saldo } from "../stock";

export async function obtenerCotizacion(tx: Tx, id: string, verCliente: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  const [c] = await tx.select().from(cotizacion).where(eq(cotizacion.id, id));
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  const items = await tx.select().from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, id)).orderBy(asc(cotizacionItem.orden));
  const [cli] = c.clienteId && verCliente ? await tx.select().from(cliente).where(eq(cliente.id, c.clienteId)) : [];
  const [vigente] = await tx.select({ id: listaPrecio.id, version: listaPrecio.version }).from(listaPrecio).where(eq(listaPrecio.vigente, true));
  const [usada] = c.listaId ? await tx.select({ version: listaPrecio.version }).from(listaPrecio).where(eq(listaPrecio.id, c.listaId)) : [];
  const [aprobador] = c.aprobadaPor ? await tx.select({ nombre: usuario.nombre }).from(usuario).where(eq(usuario.id, c.aprobadaPor)) : [];
  // Nota de pedido creada desde esta cotización (una como máximo, REQ-COT-8.3) y vigencia configurada (REQ-COT-6.1).
  const [pedido] = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado }).from(notaPedido).where(eq(notaPedido.cotizacionId, id));
  const [vigencia] = await tx.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, "vigencia_dias_habiles"));

  const conAviso = await Promise.all(items.map(async (i) => {
    if (i.estadoItem !== "ok" || !i.articuloId) return { ...i, avisoStock: null };
    const { disponible } = await saldo(tx, { articuloId: i.articuloId });
    const faltan = i.cantidad - Math.max(disponible, 0);
    return { ...i, avisoStock: faltan > 0 ? `Disponible ${Math.max(disponible, 0)} · faltan ${faltan} (a fabricar)` : null };
  }));
  const vencida = c.estado === "aprobada" && c.vigenciaHasta !== null && c.vigenciaHasta < hoySantiago();

  return {
    ...c, vencida, items: conAviso,
    cliente: cli ? { id: cli.id, nombre: cli.nombre, rut: cli.rut, comuna: cli.comuna, contacto: cli.contacto } : c.clienteId ? { id: c.clienteId, nombre: "(oculto)" } : null,
    lista: { usada: usada?.version ?? null, vigente: vigente?.version ?? null, desactualizada: Boolean(usada && vigente && usada.version !== vigente.version && c.estado === "borrador") },
    aprobador: aprobador?.nombre ?? null,
    pedido: pedido ?? null,
    vigenciaDias: Number(vigencia?.valor ?? 10),
    pendientes: items.filter((i) => i.estadoItem !== "ok").length,
  };
}

/** Sin `clientes.ver` el nombre del cliente sale como "(oculto)" y no se busca por él (REQ-NFR-5, SECURITY §datos personales). */
export async function listarCotizaciones(tx: Tx, f: { estado?: string; q?: string; desde?: string; hasta?: string; antesDe?: number; limite?: number }, verCliente: boolean) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const condiciones = [];
  if (f.estado === "vencida") condiciones.push(and(eq(cotizacion.estado, "aprobada"), lt(cotizacion.vigenciaHasta, hoySantiago())));
  else if (f.estado) condiciones.push(eq(cotizacion.estado, f.estado));
  if (f.q) {
    const porNumero = sql`${cotizacion.numero}::text = ${f.q.replace(/\D/g, "") || "-1"}`;
    condiciones.push(verCliente ? or(ilike(cliente.nombre, `%${f.q}%`), porNumero) : porNumero);
  }
  // Fechas de creación en días calendario de Santiago (REQ-COT-10.1).
  if (f.desde) condiciones.push(sql`${cotizacion.creadoEn} >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Santiago'`);
  if (f.hasta) condiciones.push(sql`${cotizacion.creadoEn} < ((${f.hasta}::date + 1))::timestamp AT TIME ZONE 'America/Santiago'`);
  if (f.antesDe) condiciones.push(lt(cotizacion.numero, f.antesDe));
  const filas = await tx
    .select({ id: cotizacion.id, numero: cotizacion.numero, estado: cotizacion.estado, origen: cotizacion.origen, creadoEn: cotizacion.creadoEn,
      vigenciaHasta: cotizacion.vigenciaHasta, total: cotizacion.total, cliente: cliente.nombre, pedidoEstado: notaPedido.estado,
      pendientes: sql<number>`(SELECT count(*)::int FROM ${cotizacionItem} WHERE ${cotizacionItem.cotizacionId} = ${cotizacion.id} AND ${cotizacionItem.estadoItem} <> 'ok')` })
    .from(cotizacion).leftJoin(cliente, eq(cliente.id, cotizacion.clienteId)).leftJoin(notaPedido, eq(notaPedido.cotizacionId, cotizacion.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(cotizacion.numero)).limit(limite + 1);
  const hoy = hoySantiago();
  const datos = filas.slice(0, limite).map((x) => ({ ...x, cliente: x.cliente && !verCliente ? "(oculto)" : x.cliente, vencida: x.estado === "aprobada" && x.vigenciaHasta !== null && x.vigenciaHasta < hoy }));
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.numero : null };
}
