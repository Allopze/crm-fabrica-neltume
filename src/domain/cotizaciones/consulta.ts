// Lectura de cotizaciones (REQ-COT-2.6, 3.1, 6.3, 10). Avisos de stock calculados al leer, nunca guardados.
import { and, asc, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { listaPrecio } from "@/db/esquema/catalogo";
import { cliente, cotizacion, cotizacionItem } from "@/db/esquema/comercial";
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
    pendientes: items.filter((i) => i.estadoItem !== "ok").length,
  };
}

export async function listarCotizaciones(tx: Tx, f: { estado?: string; q?: string; antesDe?: number; limite?: number }) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const condiciones = [];
  if (f.estado === "vencida") condiciones.push(and(eq(cotizacion.estado, "aprobada"), lt(cotizacion.vigenciaHasta, hoySantiago())));
  else if (f.estado) condiciones.push(eq(cotizacion.estado, f.estado));
  if (f.q) condiciones.push(or(ilike(cliente.nombre, `%${f.q}%`), sql`${cotizacion.numero}::text = ${f.q.replace(/\D/g, "") || "-1"}`));
  if (f.antesDe) condiciones.push(lt(cotizacion.numero, f.antesDe));
  const filas = await tx
    .select({ id: cotizacion.id, numero: cotizacion.numero, estado: cotizacion.estado, origen: cotizacion.origen, creadoEn: cotizacion.creadoEn,
      vigenciaHasta: cotizacion.vigenciaHasta, total: cotizacion.total, cliente: cliente.nombre,
      pendientes: sql<number>`(SELECT count(*)::int FROM ${cotizacionItem} WHERE ${cotizacionItem.cotizacionId} = ${cotizacion.id} AND ${cotizacionItem.estadoItem} <> 'ok')` })
    .from(cotizacion).leftJoin(cliente, eq(cliente.id, cotizacion.clienteId))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(cotizacion.numero)).limit(limite + 1);
  const hoy = hoySantiago();
  const datos = filas.slice(0, limite).map((x) => ({ ...x, vencida: x.estado === "aprobada" && x.vigenciaHasta !== null && x.vigenciaHasta < hoy }));
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.numero : null };
}
