// Entradas, salidas y ajustes manuales de puertas (REQ-STK-3, 4, 5 y 8.2–8.3), con o sin códigos indicados.
import type { Tx } from "@/db/conexion";
import type { Actor, Origen } from "../auditoria";
import { ErrorDominio } from "../errores";
import { articuloPorCodigo, type MovimientoInsertado, type NuevoMovimiento, porArticulo, registrarMovimientos } from "../stock";

type Usuario = Actor & { id: string };
const resultado = (xs: MovimientoInsertado[]) => ({ id: xs[0].id, puertas: xs.flatMap((m) => (m.puertaCodigo && m.tipo !== "liberacion" ? [m.puertaCodigo] : [])) });

function cantidadDe(cantidad: number | undefined, puertas: string[] | undefined): number {
  if (puertas?.length && cantidad !== undefined && cantidad !== puertas.length) {
    throw new ErrorDominio("VALIDACION", `La cantidad (${cantidad}) no coincide con las puertas indicadas (${puertas.length}).`);
  }
  const n = cantidad ?? puertas?.length;
  if (!n) throw new ErrorDominio("VALIDACION", "Indica la cantidad o las puertas.");
  return n;
}

export interface Entrada { codigo: string; cantidad?: number; puertas?: string[]; ubicacion?: string; referencia?: string }

/** Entrada de puertas terminadas: cada una con su código (el indicado o el siguiente de la serie). */
export async function registrarEntrada(tx: Tx, d: Entrada, actor: Usuario, origen: Origen, clave?: string) {
  const a = await articuloPorCodigo(tx, d.codigo);
  const xs = await registrarMovimientos(tx, [{ articuloId: a.id, tipo: "entrada_produccion", cantidad: cantidadDe(d.cantidad, d.puertas), puertas: d.puertas,
    datosPuerta: { ubicacion: d.ubicacion }, refTipo: "manual", refId: d.referencia }], actor, origen, clave);
  return resultado(xs);
}

export interface Salida { codigo?: string; cantidad?: number; puertas?: string[]; referencia?: string }

/** Salida por despacho fuera de una nota de pedido (también la venta de una puerta fuera de catálogo con su documento). */
export async function registrarSalida(tx: Tx, d: Salida, actor: Usuario, origen: Origen, clave?: string) {
  const n = cantidadDe(d.cantidad, d.puertas);
  const base = { tipo: "salida_despacho" as const, refTipo: "manual", refId: d.referencia };
  let movs: NuevoMovimiento[];
  if (d.puertas?.length) {
    const defecto = d.codigo ? (await articuloPorCodigo(tx, d.codigo)).id : undefined;
    movs = [...(await porArticulo(tx, d.puertas, defecto))].map(([articuloId, puertas]) => ({ ...base, articuloId, cantidad: -puertas.length, puertas }));
  } else {
    if (!d.codigo) throw new ErrorDominio("VALIDACION", "Indica el artículo o las puertas.");
    movs = [{ ...base, articuloId: (await articuloPorCodigo(tx, d.codigo)).id, cantidad: -n }];
  }
  return resultado(await registrarMovimientos(tx, movs, actor, origen, clave));
}

export interface Ajuste { codigo?: string; materiaPrimaId?: string; cantidad: number; motivo: string; puertas?: string[]; ubicacion?: string }

/** Ajuste con motivo. En puertas: positivo crea o devuelve puertas al stock; negativo saca las indicadas o las más antiguas. */
export async function registrarAjuste(tx: Tx, d: Ajuste, actor: Usuario, origen: Origen, clave?: string) {
  if (d.materiaPrimaId) {
    if (d.puertas?.length) throw new ErrorDominio("VALIDACION", "Las materias primas no tienen puertas.");
    return resultado(await registrarMovimientos(tx, [{ materiaPrimaId: d.materiaPrimaId, tipo: "ajuste", cantidad: d.cantidad, motivo: d.motivo, refTipo: "ajuste" }], actor, origen, clave));
  }
  if (!Number.isInteger(d.cantidad)) throw new ErrorDominio("VALIDACION", "Las puertas se ajustan en unidades enteras.");
  const signo = Math.sign(d.cantidad);
  cantidadDe(Math.abs(d.cantidad), d.puertas);
  const base = { tipo: "ajuste" as const, motivo: d.motivo, refTipo: "ajuste", datosPuerta: { ubicacion: d.ubicacion } };
  const defecto = d.codigo ? (await articuloPorCodigo(tx, d.codigo)).id : undefined;
  let movs: NuevoMovimiento[];
  if (d.puertas?.length) {
    movs = [...(await porArticulo(tx, d.puertas, defecto))].map(([articuloId, puertas]) => ({ ...base, articuloId, cantidad: signo * puertas.length, puertas }));
  } else {
    if (!defecto) throw new ErrorDominio("VALIDACION", "Indica un artículo o una materia prima.");
    movs = [{ ...base, articuloId: defecto, cantidad: d.cantidad }];
  }
  return resultado(await registrarMovimientos(tx, movs, actor, origen, clave));
}
