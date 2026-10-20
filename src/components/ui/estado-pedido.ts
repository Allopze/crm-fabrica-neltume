import type { ESTADOS_PEDIDO } from "@/db/esquema/comercial";

export const estadosPedido: Record<(typeof ESTADOS_PEDIDO)[number], { texto: string; tono: "pizarra" | "ambar" | "musgo" | "neutro" | "error" }> = {
  pendiente: { texto: "Pendiente", tono: "ambar" },
  en_produccion: { texto: "En producción", tono: "pizarra" },
  lista: { texto: "Lista para despacho", tono: "musgo" },
  despachada: { texto: "Despachada", tono: "neutro" },
  cancelada: { texto: "Cancelada", tono: "error" },
};

export const estadoPedido = (e: string) => estadosPedido[e as keyof typeof estadosPedido] ?? { texto: e, tono: "neutro" as const };

/** Estado de pago calculado (ADR-0020): color y texto, nunca solo color. */
export const estadosPago = {
  sin_control: { texto: "Sin control de pago", tono: "neutro" },
  sin_abono: { texto: "Sin abono", tono: "ambar" },
  abonado: { texto: "Abonado", tono: "pizarra" },
  pagado: { texto: "Pagado", tono: "musgo" },
} as const satisfies Record<string, { texto: string; tono: "pizarra" | "ambar" | "musgo" | "neutro" }>;

export const estadoPago = (e: string) => estadosPago[e as keyof typeof estadosPago] ?? { texto: e, tono: "neutro" as const };

export const MEDIOS: Record<string, string> = { transferencia: "Transferencia", efectivo: "Efectivo", cheque: "Cheque", tarjeta: "Tarjeta", otro: "Otro" };
