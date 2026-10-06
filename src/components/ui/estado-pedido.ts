import type { Pedido } from "@/mock/comercial";

export const estadosPedido: Record<Pedido["estado"], { texto: string; tono: "pizarra" | "ambar" | "musgo" | "neutro" }> = {
  pendiente: { texto: "Pendiente", tono: "ambar" },
  en_produccion: { texto: "En producción", tono: "pizarra" },
  lista: { texto: "Lista para despacho", tono: "musgo" },
  despachada: { texto: "Despachada", tono: "neutro" },
};
