import { Etiqueta } from "@/components/ui/base";

export type EstadoCotizacion = "interpretando" | "borrador" | "ia_fallida" | "aprobada" | "aceptada" | "vencida";

const mapa: Record<EstadoCotizacion, { texto: string; tono: "neutro" | "musgo" | "ambar" | "pizarra" | "rauli" | "error" }> = {
  interpretando: { texto: "Interpretando", tono: "pizarra" },
  borrador: { texto: "Borrador", tono: "ambar" },
  ia_fallida: { texto: "IA no disponible", tono: "error" },
  aprobada: { texto: "Aprobada", tono: "musgo" },
  aceptada: { texto: "Aceptada · pedido", tono: "rauli" },
  vencida: { texto: "Vencida", tono: "neutro" },
};

/** Una aceptada cuyo pedido se canceló no debe seguir diciendo «pedido». */
export function EstadoCotizacionEtiqueta({ estado, pedidoEstado }: { estado: EstadoCotizacion; pedidoEstado?: string | null }) {
  const e = estado === "aceptada" && pedidoEstado === "cancelada" ? { texto: "Aceptada · pedido cancelado", tono: "neutro" as const } : mapa[estado];
  return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
}
