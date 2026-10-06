// Órdenes de producción (REQ-MP-4). Cerrar = consumo de insumos por BOM + entrada de puertas, todo o nada.
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { materiaPrima, ordenLinea, ordenProduccion } from "@/db/esquema/produccion";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { bomVigentePara } from "./bom";
import { ErrorDominio } from "./errores";
import { type NuevoMovimiento, registrarMovimientos, saldo } from "./stock";

export async function crearOrden(tx: Tx, d: { lineas: { codigo: string; cantidad: number }[]; observacion?: string; notaPedidoId?: string }, actor: Actor & { id: string }, origen: Origen) {
  if (!d.lineas.length) throw new ErrorDominio("VALIDACION", "La orden necesita al menos un artículo");
  const codigos = d.lineas.map((l) => l.codigo.trim().toUpperCase());
  if (new Set(codigos).size !== codigos.length) throw new ErrorDominio("VALIDACION", "Un artículo aparece dos veces");
  const arts = await tx.select().from(articulo).where(inArray(articulo.codigo, codigos));
  const faltan = codigos.filter((c) => !arts.some((a) => a.codigo === c));
  if (faltan.length) throw new ErrorDominio("VALIDACION", "Códigos inexistentes", { faltan });
  const [o] = await tx.insert(ordenProduccion).values({ creadoPor: actor.id, observacion: d.observacion, notaPedidoId: d.notaPedidoId }).returning();
  await tx.insert(ordenLinea).values(d.lineas.map((l, i) => ({ ordenId: o.id, articuloId: arts.find((a) => a.codigo === codigos[i])!.id, cantidad: l.cantidad })));
  await registrarAuditoria(tx, { actor, accion: "crear", recurso: "orden_produccion", recursoId: o.id, despues: { numero: o.numero, lineas: d.lineas }, resultado: "ok", origen });
  return o;
}

async function lineasDe(tx: Tx, ordenId: string) {
  return tx.select({ articuloId: articulo.id, codigo: articulo.codigo, modeloId: articulo.modeloId, anchoCodigo: articulo.anchoCodigo, altoCodigo: articulo.altoCodigo, cantidad: ordenLinea.cantidad })
    .from(ordenLinea).innerJoin(articulo, eq(articulo.id, ordenLinea.articuloId)).where(eq(ordenLinea.ordenId, ordenId));
}

/** Consumos que causaría cerrar la orden, con lo disponible y faltante por insumo (vista previa, UX §4). */
export async function planDeCierre(tx: Tx, ordenId: string, manuales: { materiaPrimaId: string; cantidad: number }[] = []) {
  const lineas = await lineasDe(tx, ordenId);
  const sinBom: string[] = [];
  const origenBom: Record<string, string> = {};
  const consumo = new Map<string, number>();
  for (const l of lineas) {
    const b = await bomVigentePara(tx, l);
    if (!b) { sinBom.push(l.codigo); continue; }
    origenBom[l.codigo] = b.origen;
    for (const x of b.lineas) consumo.set(x.materiaPrimaId, (consumo.get(x.materiaPrimaId) ?? 0) + Number(x.cantidad) * l.cantidad);
  }
  for (const m of manuales) consumo.set(m.materiaPrimaId, (consumo.get(m.materiaPrimaId) ?? 0) + m.cantidad);
  const nombres = consumo.size ? new Map((await tx.select().from(materiaPrima).where(inArray(materiaPrima.id, [...consumo.keys()]))).map((m) => [m.id, m])) : new Map();
  const insumos = [];
  for (const [id, cantidad] of consumo) {
    const { existencia } = await saldo(tx, { materiaPrimaId: id });
    const usa = Number(cantidad.toFixed(3));
    insumos.push({ materiaPrimaId: id, nombre: nombres.get(id)?.nombre ?? "?", unidad: nombres.get(id)?.unidadCodigo ?? "", usa, existencia, faltante: Math.max(0, Number((usa - existencia).toFixed(3))) });
  }
  return { lineas, sinBom, origenBom, insumos };
}

/** Cierra la orden: consume insumos y da entrada a las puertas en una sola transacción (REQ-MP-4.1–4.4). */
export async function cerrarOrden(tx: Tx, ordenId: string, manuales: { materiaPrimaId: string; cantidad: number }[], actor: Actor & { id: string }, origen: Origen, clave?: string) {
  const [o] = await tx.select().from(ordenProduccion).where(eq(ordenProduccion.id, ordenId)).for("update");
  if (!o) throw new ErrorDominio("NO_ENCONTRADO", "Orden no encontrada");
  if (o.estado !== "abierta") throw new ErrorDominio("ORDEN_CERRADA", `La orden ${o.numero} ya está ${o.estado}; no se repiten movimientos.`);

  const plan = await planDeCierre(tx, ordenId, manuales);
  if (plan.sinBom.length && !manuales.length) {
    throw new ErrorDominio("SIN_BOM", "Hay artículos sin BOM: registra el consumo de materias primas a mano antes de cerrar.", { sinBom: plan.sinBom });
  }
  const faltantes = plan.insumos.filter((i) => i.faltante > 0);
  if (faltantes.length) throw new ErrorDominio("INSUMOS_INSUFICIENTES", "Faltan materias primas para cerrar la orden.", { faltantes });

  const movs: NuevoMovimiento[] = [
    ...plan.insumos.map((i) => ({ materiaPrimaId: i.materiaPrimaId, tipo: "consumo_produccion" as const, cantidad: -i.usa, refTipo: "orden", refId: String(o.numero) })),
    ...plan.lineas.map((l) => ({ articuloId: l.articuloId, tipo: "entrada_produccion" as const, cantidad: l.cantidad, refTipo: "orden", refId: String(o.numero) })),
  ];
  await registrarMovimientos(tx, movs, actor, origen, clave);
  await tx.update(ordenProduccion).set({ estado: "cerrada", cerradaEn: sql`now()`, cerradoPor: actor.id }).where(eq(ordenProduccion.id, ordenId));
  await registrarAuditoria(tx, { actor, accion: "cerrar", recurso: "orden_produccion", recursoId: ordenId, antes: { estado: "abierta" }, despues: { estado: "cerrada", insumos: plan.insumos.map((i) => ({ mp: i.nombre, usa: i.usa })), bom: plan.origenBom }, resultado: "ok", origen });
  return { numero: o.numero, insumos: plan.insumos, puertas: plan.lineas.map((l) => ({ codigo: l.codigo, cantidad: l.cantidad })) };
}

export async function anularOrden(tx: Tx, ordenId: string, actor: Actor & { id: string }, origen: Origen) {
  const [o] = await tx.select().from(ordenProduccion).where(eq(ordenProduccion.id, ordenId)).for("update");
  if (!o) throw new ErrorDominio("NO_ENCONTRADO", "Orden no encontrada");
  if (o.estado !== "abierta") throw new ErrorDominio("ORDEN_CERRADA", `La orden ${o.numero} ya está ${o.estado}.`);
  await tx.update(ordenProduccion).set({ estado: "anulada" }).where(eq(ordenProduccion.id, ordenId));
  await registrarAuditoria(tx, { actor, accion: "anular", recurso: "orden_produccion", recursoId: ordenId, antes: { estado: "abierta" }, despues: { estado: "anulada" }, resultado: "ok", origen });
}

export async function listarOrdenes(tx: Tx) {
  const ordenes = await tx.select().from(ordenProduccion).orderBy(desc(ordenProduccion.numero)).limit(100);
  const lineas = ordenes.length ? await tx.select({ ordenId: ordenLinea.ordenId, codigo: articulo.codigo, cantidad: ordenLinea.cantidad })
    .from(ordenLinea).innerJoin(articulo, eq(articulo.id, ordenLinea.articuloId)).where(inArray(ordenLinea.ordenId, ordenes.map((o) => o.id))) : [];
  return ordenes.map((o) => ({ ...o, lineas: lineas.filter((l) => l.ordenId === o.id) }));
}
