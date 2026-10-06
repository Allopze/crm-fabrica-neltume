import type { ESTADOS_PEDIDO } from "@/db/esquema/comercial";

export const estadosPedido: Record<(typeof ESTADOS_PEDIDO)[number], { texto: string; tono: "pizarra" | "ambar" | "musgo" | "neutro" | "error" }> = {
  pendiente: { texto: "Pendiente", tono: "ambar" },
  en_produccion: { texto: "En producción", tono: "pizarra" },
  lista: { texto: "Lista para despacho", tono: "musgo" },
  despachada: { texto: "Despachada", tono: "neutro" },
  cancelada: { texto: "Cancelada", tono: "error" },
};

export const estadoPedido = (e: string) => estadosPedido[e as keyof typeof estadosPedido] ?? { texto: e, tono: "neutro" as const };
