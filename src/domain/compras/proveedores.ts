// Proveedores habilitados para leer sus facturas desde Chipax y mapeos de sus ítems (ADR-0021, REQ-MP-7.1–7.3).
import { asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { mapeoItemCompra, proveedorCompra, sincronizacionChipax } from "@/db/esquema/compras";
import { materiaPrima } from "@/db/esquema/produccion";
import { usuario } from "@/db/esquema/seguridad";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { hoySantiago } from "../precios/dias-habiles";
import { normalizarRut, rutValido } from "../rut";

type Usuario = Actor & { id: string };

export async function listarProveedores(tx: Tx) {
  return tx.select({ rut: proveedorCompra.rut, nombre: proveedorCompra.nombre, activo: proveedorCompra.activo, habilitadoDesde: proveedorCompra.habilitadoDesde,
    habilitadoPor: usuario.nombre }).from(proveedorCompra).innerJoin(usuario, eq(usuario.id, proveedorCompra.habilitadoPor)).orderBy(asc(proveedorCompra.nombre));
}

/**
 * Habilita un proveedor desde hoy: solo se leen sus facturas emitidas desde ahora, para no duplicar lo recibido a mano.
 * Las recepciones automáticas quedan a nombre de quien lo habilita. Reactivar uno inactivo también parte desde hoy.
 */
export async function habilitarProveedor(tx: Tx, d: { rut: string; nombre: string }, actor: Usuario, origen: Origen) {
  const rut = normalizarRut(d.rut);
  if (!rut || !rutValido(rut)) throw new ErrorDominio("VALIDACION", "El RUT del proveedor no es válido.");
  if (!d.nombre.trim()) throw new ErrorDominio("VALIDACION", "Indica el nombre del proveedor.");
  const [antes] = await tx.select().from(proveedorCompra).where(eq(proveedorCompra.rut, rut)).for("update");
  if (antes?.activo) throw new ErrorDominio("VALIDACION", "Ese proveedor ya está habilitado.");
  const valores = { nombre: d.nombre.trim(), activo: true, habilitadoDesde: hoySantiago(), habilitadoPor: actor.id };
  if (antes) await tx.update(proveedorCompra).set(valores).where(eq(proveedorCompra.rut, rut));
  else await tx.insert(proveedorCompra).values({ rut, ...valores });
  await registrarAuditoria(tx, { actor, accion: "habilitar proveedor", recurso: "proveedor_compra", recursoId: rut, resultado: "ok", origen,
    antes: antes ? { activo: false, desde: antes.habilitadoDesde } : undefined, despues: { nombre: valores.nombre, desde: valores.habilitadoDesde } });
  return { rut, ...valores };
}

export async function desactivarProveedor(tx: Tx, rutEntrada: string, actor: Usuario, origen: Origen) {
  const rut = normalizarRut(rutEntrada) ?? "";
  const [antes] = await tx.select().from(proveedorCompra).where(eq(proveedorCompra.rut, rut)).for("update");
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Proveedor no encontrado");
  if (!antes.activo) return;
  await tx.update(proveedorCompra).set({ activo: false }).where(eq(proveedorCompra.rut, rut));
  await registrarAuditoria(tx, { actor, accion: "desactivar proveedor", recurso: "proveedor_compra", recursoId: rut, resultado: "ok", origen,
    antes: { activo: true }, despues: { activo: false } });
}

export async function listarMapeos(tx: Tx) {
  return tx.select({ id: mapeoItemCompra.id, proveedor: proveedorCompra.nombre, proveedorRut: mapeoItemCompra.proveedorRut, descripcion: mapeoItemCompra.descripcion,
    materiaPrimaId: mapeoItemCompra.materiaPrimaId, materiaPrima: materiaPrima.nombre, unidad: materiaPrima.unidadCodigo, factor: mapeoItemCompra.factor,
    unidadFacturada: mapeoItemCompra.unidadFacturada, ignorar: mapeoItemCompra.ignorar })
    .from(mapeoItemCompra).innerJoin(proveedorCompra, eq(proveedorCompra.rut, mapeoItemCompra.proveedorRut))
    .leftJoin(materiaPrima, eq(materiaPrima.id, mapeoItemCompra.materiaPrimaId)).orderBy(asc(proveedorCompra.nombre), asc(mapeoItemCompra.descripcion));
}

/** Cambia el destino de un ítem para las facturas que vengan; lo ya recibido no cambia (se corrige con ajuste). */
export async function editarMapeo(tx: Tx, id: string, d: { materiaPrimaId?: string; factor?: number; ignorar?: boolean }, actor: Usuario, origen: Origen) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Mapeo no encontrado");
  const [antes] = await tx.select().from(mapeoItemCompra).where(eq(mapeoItemCompra.id, id)).for("update");
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Mapeo no encontrado");
  const despues = {
    ignorar: d.ignorar ?? antes.ignorar,
    materiaPrimaId: d.ignorar ? null : (d.materiaPrimaId ?? antes.materiaPrimaId),
    factor: d.ignorar ? null : (d.factor ?? antes.factor),
  };
  if (!despues.ignorar) {
    if (!despues.materiaPrimaId) throw new ErrorDominio("VALIDACION", "Elige la materia prima.");
    if (!(despues.factor !== null && despues.factor > 0 && despues.factor <= 1e6)) throw new ErrorDominio("VALIDACION", "El factor debe ser un número mayor que cero.");
    const [mp] = await tx.select().from(materiaPrima).where(eq(materiaPrima.id, despues.materiaPrimaId));
    if (!mp?.activo) throw new ErrorDominio("VALIDACION", "Elige una materia prima activa.");
  }
  await tx.update(mapeoItemCompra).set({ ...despues, actualizadoEn: sql`now()` }).where(eq(mapeoItemCompra.id, id));
  await registrarAuditoria(tx, { actor, accion: "editar mapeo compra", recurso: "mapeo_item_compra", recursoId: id, resultado: "ok", origen,
    antes: { materiaPrimaId: antes.materiaPrimaId, factor: antes.factor, ignorar: antes.ignorar }, despues });
}

/**
 * «Sincronizar ahora» (REQ-MP-7.7): deja una petición para el servicio de compras. Si ya hay una pendiente o en
 * curso, no se suma otra.
 */
export async function solicitarSincronizacion(tx: Tx, actor: Usuario, origen: Origen) {
  const [abierta] = await tx.select({ id: sincronizacionChipax.id, inicio: sincronizacionChipax.inicio }).from(sincronizacionChipax)
    .where(sql`${sincronizacionChipax.fin} IS NULL AND (${sincronizacionChipax.inicio} IS NULL OR ${sincronizacionChipax.inicio} > now() - interval '30 minutes')`).limit(1);
  if (abierta) return { id: abierta.id, nueva: false };
  const [s] = await tx.insert(sincronizacionChipax).values({ solicitadaPor: actor.id }).returning({ id: sincronizacionChipax.id });
  await registrarAuditoria(tx, { actor, accion: "solicitar sincronizacion", recurso: "sincronizacion_chipax", recursoId: s.id, resultado: "ok", origen });
  return { id: s.id, nueva: true };
}
