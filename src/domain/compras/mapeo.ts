// Decisión sobre cada línea de una factura de compra (ADR-0021, REQ-MP-7.2–7.4). Puro: se prueba sin BD.
// Solo hay certeza con coincidencia exacta del ítem del proveedor (análogo a la regla 2); lo demás no mueve stock.

export type EstadoLinea = "recibida" | "por_asociar" | "por_revisar" | "ignorada";

/** Mayúsculas, sin tildes ni espacios repetidos: «Tablón  pino» → «TABLON PINO». */
export const normalizarTexto = (t: string | null | undefined): string =>
  String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();

/** Clave del ítem: su código si la factura lo trae; si no, su nombre normalizado. */
export function claveItem(l: { codigo: string | null; nombre: string }): string {
  const codigo = normalizarTexto(l.codigo);
  return codigo ? `C:${codigo}` : `N:${normalizarTexto(l.nombre)}`;
}

/** Unidad comparable: «Un.», «UN» y «un» → «UN»; vacía → nula. */
export function normalizarUnidad(u: string | null | undefined): string | null {
  return normalizarTexto(u).replace(/[.\s]/g, "") || null;
}

export interface MapeoLinea {
  materiaPrimaId: string | null; factor: number | null; unidadFacturada: string | null; ignorar: boolean;
  /** Falso si la materia prima asociada se desactivó. */
  materiaActiva?: boolean;
}

export type Decision =
  | { estado: "recibida"; materiaPrimaId: string; cantidad: number }
  | { estado: "por_asociar" }
  | { estado: "ignorada" }
  | { estado: "por_revisar"; motivo: string };

/** Qué pasa con una línea según el tipo de documento y el mapeo de su ítem (si existe). */
export function decidirLinea(tipoDocumento: number, l: { cantidad: number | null; unidad: string | null }, m: MapeoLinea | undefined): Decision {
  if (tipoDocumento === 61) return { estado: "por_revisar", motivo: "Nota de crédito: si hubo devolución, regístrala como ajuste." };
  if (tipoDocumento === 56) return { estado: "por_revisar", motivo: "Nota de débito: revisa si cambia lo recibido." };
  if (m?.ignorar) return { estado: "ignorada" };
  if (l.cantidad === null || !(l.cantidad > 0)) return { estado: "por_revisar", motivo: "La línea no trae una cantidad positiva." };
  if (!m) return { estado: "por_asociar" };
  if (m.materiaActiva === false) return { estado: "por_revisar", motivo: "La materia prima asociada está inactiva." };
  const unidad = normalizarUnidad(l.unidad);
  if (unidad !== m.unidadFacturada) {
    return { estado: "por_revisar", motivo: `La unidad cambió: «${l.unidad ?? "sin unidad"}» (se esperaba «${m.unidadFacturada ?? "sin unidad"}»).` };
  }
  const cantidad = Math.round(l.cantidad * Number(m.factor) * 1000) / 1000;
  if (!(cantidad > 0) || !m.materiaPrimaId) return { estado: "por_revisar", motivo: "La cantidad convertida no es positiva." };
  return { estado: "recibida", materiaPrimaId: m.materiaPrimaId, cantidad };
}
