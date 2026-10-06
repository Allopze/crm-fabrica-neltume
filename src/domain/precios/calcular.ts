// Cálculo determinista de importes (REQ-COT-1.2, 1.3, 2.2; DATA-MODEL §3). Única fuente de precios:
// la IA nunca aporta importes. Todos los resultados son pesos enteros (CLP).

export const IVA = 0.19;

/** Redondeo al peso, mitad hacia arriba, sin arrastrar error de coma flotante. */
export function alPeso(x: number): number {
  return Math.round(Number(x.toFixed(6)));
}

export interface EntradaLinea {
  precioNetoLista: number; // de la versión de lista (puede traer decimales)
  recargoPct: number; // 0.12 = 12 %
  cantidad: number;
}

export function calcularLinea({ precioNetoLista, recargoPct, cantidad }: EntradaLinea) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new RangeError("La cantidad debe ser un entero positivo");
  if (precioNetoLista <= 0 || recargoPct < 0) throw new RangeError("Precio o recargo inválido");
  const precioUnitario = alPeso(precioNetoLista * (1 + recargoPct));
  return { precioUnitario, totalLinea: precioUnitario * cantidad };
}

/** Totales sobre líneas ya enteras. El descuento (0–1) se aplica al subtotal y antes del IVA. */
export function calcularTotales(totalesLinea: number[], descuentoPct = 0) {
  if (descuentoPct < 0 || descuentoPct >= 1) throw new RangeError("Descuento inválido");
  const subtotal = totalesLinea.reduce((s, t) => s + t, 0);
  const descuento = alPeso(subtotal * descuentoPct);
  const neto = subtotal - descuento;
  const iva = alPeso(neto * IVA);
  return { subtotal, descuento, neto, iva, total: neto + iva };
}

/** Precio unitario con IVA, para mostrar en la lista (misma regla de redondeo). */
export function conIva(precioUnitario: number): number {
  return alPeso(precioUnitario * (1 + IVA));
}
