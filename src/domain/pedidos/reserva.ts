// Reparto de la reserva al confirmar un pedido (REQ-STK-7.1, 7.3): se reserva lo disponible y el resto queda
// como faltante. Si un artículo aparece en varias líneas, el disponible se consume en orden.

export interface LineaAReservar { articuloId: string | null; cantidad: number }
export interface Reparto { reservado: number; faltante: number }

export function repartirReserva(lineas: LineaAReservar[], disponible: ReadonlyMap<string, number>): Reparto[] {
  const queda = new Map(disponible);
  return lineas.map((l) => {
    if (!l.articuloId) return { reservado: 0, faltante: l.cantidad }; // a pedido: siempre se fabrica
    const libre = Math.max(queda.get(l.articuloId) ?? 0, 0);
    const reservado = Math.min(libre, l.cantidad);
    queda.set(l.articuloId, libre - reservado);
    return { reservado, faltante: l.cantidad - reservado };
  });
}
