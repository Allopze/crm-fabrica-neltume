// Alertas de stock mínimo (REQ-STK-6.1) y de reposición de materias primas (REQ-MP-6.1). Solo lectura.
import type { Tx } from "@/db/conexion";
import { listarMateriasPrimas } from "./materias-primas";
import { listarStock } from "./stock";

/** Puertas con mínimo definido cuyo DISPONIBLE (existencia − reservado) está bajo el mínimo. */
export async function puertasBajoMinimo(tx: Tx, limite = 200) {
  const { datos } = await listarStock(tx, { bajoMinimo: true, limite });
  return datos.map((a) => ({ ...a, faltan: (a.minimo ?? 0) - a.disponible })).sort((x, y) => y.faltan - x.faltan);
}

/** Materias primas activas cuya existencia está bajo su mínimo, con lo que falta para llegar a él. */
export async function materiasParaReponer(tx: Tx) {
  return (await listarMateriasPrimas(tx))
    .filter((m) => m.activo && m.stockMinimo !== null && m.existencia < m.stockMinimo)
    .map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad, existencia: m.existencia, minimo: m.stockMinimo!, faltan: m.stockMinimo! - m.existencia, ultimaRecepcion: m.ultimaRecepcion }));
}
