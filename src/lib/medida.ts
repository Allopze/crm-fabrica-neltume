// La medida que pidió el cliente, impresa y mostrada igual en los PDF y en las pantallas (REQ-COT-2.12, REQ-COT-4.12).
// Pura: la usan el servidor y los componentes de cliente.

/** Ancho y alto pedidos, en milímetros. */
export interface Medida { ancho: number; alto: number }

/** Metros con la precisión que haga falta, siempre con centímetros por lo menos («0,82», «0,825», «2,00»). */
export const metrosExactos = (m: number) => m.toFixed(3).replace(/0$/, "").replace(".", ",");

/** Ancho y alto pedidos, en mm, de una medida solicitada como «820 × 2000 mm (Hoja)» o «830 × 2360 mm, vano». */
export function medidaPedida(texto: string | null): Medida | null {
  const m = texto ? /(\d{3,4})\s*[×x]\s*(\d{3,4})\s*mm/i.exec(texto) : null;
  return m ? { ancho: Number(m[1]), alto: Number(m[2]) } : null;
}

const TIPO = /\s*\((?:hoja|vano)\)|,\s*(?:hoja|vano)\b/gi;

/**
 * La línea «Medida solicitada: …» de una puerta, o null si no hace falta. El título de una línea automática ya trae la medida
 * exacta («Molco · Pino Oregón · 0,82 × 2,00 m»); la línea aparte se imprime cuando el título no la trae (una descripción del
 * catálogo o escrita a mano, o una cotización antigua) o cuando hay que decir si es de hoja o de vano. El tipo («(Hoja)»,
 * «(Vano)») solo sale con `conTipo`, que es la nota de pedido y la orden de trabajo: la cotización nunca lo nombra.
 */
export function lineaDeMedida(titulo: string, medidaSolicitada: string | null | undefined, conTipo: boolean): string | null {
  if (!medidaSolicitada) return null;
  const sinTipo = medidaSolicitada.replace(TIPO, "").trim();
  const m = medidaPedida(sinTipo);
  const dichoEnElTitulo = m !== null && titulo.includes(`${metrosExactos(m.ancho / 1000)} × ${metrosExactos(m.alto / 1000)} m`);
  const conTipoDicho = conTipo && sinTipo !== medidaSolicitada.trim();
  return dichoEnElTitulo && !conTipoDicho ? null : `Medida solicitada: ${conTipo ? medidaSolicitada.trim() : sinTipo}`;
}
