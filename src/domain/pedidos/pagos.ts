// Pagos de la nota de pedido (ADR-0020, REQ-COT-8.10–8.14): registros de solo inserción, un error se corrige con un
// reverso con motivo y el estado de pago se calcula, nunca se guarda. Abono mínimo para producir y pago total para
// despachar, salvo una excepción con motivo registrada en la nota.
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { parametro } from "@/db/esquema/catalogo";
import { cotizacion, type MEDIOS_PAGO, notaPedido, pagoPedido, pedidoItem } from "@/db/esquema/comercial";
import { clp } from "@/lib/formato";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { calcularTotales } from "../precios/calcular";
import { hoySantiago } from "../precios/dias-habiles";
import { ESTADOS_ABIERTOS } from "./completar";

export type EstadoPago = "sin_control" | "sin_abono" | "abonado" | "pagado";
export type MedioPago = (typeof MEDIOS_PAGO)[number];
type Nota = typeof notaPedido.$inferSelect;
type Usuario = Actor & { id: string };

/** Estado de pago (U `pagos.estado`): el abono se redondea al peso hacia arriba; se puede pagar el total de una vez. */
export function calcularPago(d: { total: number; pagado: number; abonoPct: number; exigePago: boolean }) {
  const abonoRequerido = Math.ceil((d.total * d.abonoPct) / 100);
  const saldo = Math.max(d.total - d.pagado, 0);
  const estado: EstadoPago = !d.exigePago && d.pagado === 0 ? "sin_control"
    : d.pagado >= d.total ? "pagado" : d.pagado >= abonoRequerido ? "abonado" : "sin_abono";
  return { total: d.total, pagado: d.pagado, saldo, abonoPct: d.abonoPct, abonoRequerido, faltaAbono: Math.max(abonoRequerido - d.pagado, 0), estado };
}
export type ResumenPago = ReturnType<typeof calcularPago>;

/** % de abono (parámetro `abono_pct`, 50 por defecto; DATA-MODEL §2). */
export async function abonoPct(tx: Tx): Promise<number> {
  const [p] = await tx.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, "abono_pct"));
  const n = Number(p?.valor ?? 50);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 50;
}

/** Total con IVA de la nota: el congelado de su cotización o, desde la nota de la tienda, sus líneas (como su PDF). */
async function totalDe(tx: Tx, nota: Pick<Nota, "id" | "cotizacionId">): Promise<number> {
  if (nota.cotizacionId) {
    const [c] = await tx.select({ total: cotizacion.total }).from(cotizacion).where(eq(cotizacion.id, nota.cotizacionId));
    return Number(c.total);
  }
  const lineas = await tx.select({ total: pedidoItem.totalLinea }).from(pedidoItem).where(eq(pedidoItem.notaPedidoId, nota.id));
  return calcularTotales(lineas.map((l) => Number(l.total))).total;
}

export async function pagadoDe(tx: Tx, notaId: string): Promise<number> {
  const [r] = await tx.select({ pagado: sql<string>`coalesce(sum(${pagoPedido.monto}), 0)` }).from(pagoPedido).where(eq(pagoPedido.notaPedidoId, notaId));
  return Number(r.pagado);
}

export async function resumenPago(tx: Tx, nota: Pick<Nota, "id" | "cotizacionId" | "exigePago">): Promise<ResumenPago> {
  const total = await totalDe(tx, nota);
  return calcularPago({ total, pagado: await pagadoDe(tx, nota.id), abonoPct: await abonoPct(tx), exigePago: nota.exigePago });
}

async function tomarNota(tx: Tx, id: string): Promise<Nota> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  const [p] = await tx.select().from(notaPedido).where(eq(notaPedido.id, id)).for("update");
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  return p;
}

const auditarPago = (tx: Tx, actor: Usuario, origen: Origen, accion: string, notaId: string, r: ResumenPago, despues: Record<string, unknown>, antes?: Record<string, unknown>) =>
  registrarAuditoria(tx, { actor, accion, recurso: "nota_pedido", recursoId: notaId, resultado: "ok", origen, antes,
    despues: { ...despues, pagado: r.pagado, saldo: r.saldo, estadoPago: r.estado } });

export interface DatosPago { monto: number; fecha: string; medio: MedioPago; referencia?: string | null }

/** Registra un pago que no supere el saldo; la nota se bloquea para que dos pagos simultáneos no lo pasen (REQ-COT-8.10, 8.11). */
export async function registrarPago(tx: Tx, id: string, d: DatosPago, actor: Usuario, origen: Origen) {
  const p = await tomarNota(tx, id);
  if (p.estado === "cancelada") throw new ErrorDominio("NO_EDITABLE", `La nota de pedido ${p.numero} está cancelada: no se registran pagos.`);
  if (!Number.isInteger(d.monto) || d.monto <= 0) throw new ErrorDominio("VALIDACION", "El monto debe ser un número entero de pesos mayor que cero.");
  if (d.fecha > hoySantiago()) throw new ErrorDominio("VALIDACION", "La fecha del pago no puede ser futura.");
  const antes = await resumenPago(tx, p);
  if (antes.saldo === 0) throw new ErrorDominio("SOBREPAGO", `La nota de pedido ${p.numero} ya está pagada.`);
  if (d.monto > antes.saldo) throw new ErrorDominio("SOBREPAGO", `El pago supera el saldo de ${clp(antes.saldo)}.`, { saldo: antes.saldo });
  const referencia = d.referencia?.trim() || null;
  const [pago] = await tx.insert(pagoPedido).values({ notaPedidoId: id, monto: d.monto, fecha: d.fecha, medio: d.medio, referencia, registradoPor: actor.id })
    .returning({ id: pagoPedido.id });
  const r = await resumenPago(tx, p);
  await auditarPago(tx, actor, origen, "registrar pago", id, r, { numero: p.numero, monto: d.monto, fecha: d.fecha, medio: d.medio, referencia });
  return { id: pago.id, ...r };
}

/** Anula un pago con un registro de monto opuesto y motivo; un pago se revierte una sola vez. */
export async function revertirPago(tx: Tx, id: string, pagoId: string, motivo: string, actor: Usuario, origen: Origen) {
  if (!motivo.trim()) throw new ErrorDominio("VALIDACION", "Indica el motivo del reverso.");
  const p = await tomarNota(tx, id);
  const [pago] = /^[0-9a-f-]{36}$/i.test(pagoId)
    ? await tx.select().from(pagoPedido).where(and(eq(pagoPedido.id, pagoId), eq(pagoPedido.notaPedidoId, id))) : [];
  if (!pago) throw new ErrorDominio("NO_ENCONTRADO", "Pago no encontrado");
  if (pago.revierteId) throw new ErrorDominio("VALIDACION", "Un reverso no se revierte: registra el pago de nuevo.");
  const [previo] = await tx.select({ id: pagoPedido.id }).from(pagoPedido).where(eq(pagoPedido.revierteId, pagoId));
  if (previo) throw new ErrorDominio("YA_REVERTIDO", "Ese pago ya se revirtió.");
  await tx.insert(pagoPedido).values({ notaPedidoId: id, monto: -pago.monto, fecha: hoySantiago(), medio: pago.medio, referencia: pago.referencia,
    revierteId: pagoId, motivo: motivo.trim(), registradoPor: actor.id });
  const r = await resumenPago(tx, p);
  await auditarPago(tx, actor, origen, "revertir pago", id, r, { numero: p.numero, motivo: motivo.trim() }, { monto: pago.monto, fecha: pago.fecha, medio: pago.medio });
  return r;
}

/**
 * Excepción en una nota con control de pago (REQ-COT-8.13): `abono` deja producir sin el abono (solo pendiente) y
 * `saldo` deja despachar con saldo. Solo donde hace falta, una vez por nota y con motivo.
 */
export async function registrarExcepcion(tx: Tx, id: string, tipo: "abono" | "saldo", motivo: string, actor: Usuario, origen: Origen) {
  if (!motivo.trim()) throw new ErrorDominio("VALIDACION", "Indica el motivo de la excepción.");
  const p = await tomarNota(tx, id);
  if (!(ESTADOS_ABIERTOS as readonly string[]).includes(p.estado)) throw new ErrorDominio("NO_EDITABLE", `La nota de pedido ${p.numero} está ${p.estado}.`);
  if (!p.exigePago) throw new ErrorDominio("VALIDACION", "Esta nota es anterior al control de pagos: no necesita excepción.");
  const r = await resumenPago(tx, p);
  if (tipo === "abono") {
    if (p.excepcionAbonoEn) throw new ErrorDominio("VALIDACION", "La nota ya tiene una excepción de abono.");
    if (p.estado !== "pendiente") throw new ErrorDominio("VALIDACION", "La excepción de abono es para pasar a producción y la nota ya no está pendiente.");
    if (r.estado !== "sin_abono") throw new ErrorDominio("VALIDACION", "La nota ya tiene el abono: no hace falta la excepción.");
    await tx.update(notaPedido).set({ excepcionAbonoMotivo: motivo.trim(), excepcionAbonoPor: actor.id, excepcionAbonoEn: sql`now()` }).where(eq(notaPedido.id, id));
  } else {
    if (p.excepcionSaldoEn) throw new ErrorDominio("VALIDACION", "La nota ya tiene una excepción de saldo.");
    if (r.saldo === 0) throw new ErrorDominio("VALIDACION", "La nota ya está pagada: no hace falta la excepción.");
    await tx.update(notaPedido).set({ excepcionSaldoMotivo: motivo.trim(), excepcionSaldoPor: actor.id, excepcionSaldoEn: sql`now()` }).where(eq(notaPedido.id, id));
  }
  await auditarPago(tx, actor, origen, "excepcion de pago", id, r,
    { numero: p.numero, tipo, motivo: motivo.trim(), ...(tipo === "abono" ? { faltaAbono: r.faltaAbono } : {}) });
}

/** Compuerta de producción (REQ-COT-8.13): con control de pago, exige el abono o una excepción de abono. */
export async function exigirAbono(tx: Tx, p: Nota) {
  if (!p.exigePago || p.excepcionAbonoEn) return;
  const r = await resumenPago(tx, p);
  if (r.estado === "sin_abono") {
    throw new ErrorDominio("ABONO_PENDIENTE", `Falta el abono: ${clp(r.faltaAbono)} (${r.abonoPct} % del total). Regístralo o deja una excepción con motivo.`, { faltaAbono: r.faltaAbono });
  }
}

/** Compuerta de despacho (REQ-COT-8.13): con control de pago, exige el pago total o una excepción de saldo. */
export async function exigirPagoTotal(tx: Tx, p: Nota) {
  if (!p.exigePago || p.excepcionSaldoEn) return;
  const r = await resumenPago(tx, p);
  if (r.saldo > 0) throw new ErrorDominio("SALDO_PENDIENTE", `Falta pagar el saldo: ${clp(r.saldo)}. Regístralo o deja una excepción con motivo.`, { saldo: r.saldo });
}
