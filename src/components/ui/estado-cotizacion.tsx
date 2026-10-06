import { Etiqueta } from "@/components/ui/base";
import type { EstadoCotizacion } from "@/mock/comercial";

const mapa: Record<EstadoCotizacion, { texto: string; tono: "neutro" | "musgo" | "ambar" | "pizarra" | "rauli" | "error" }> = {
  interpretando: { texto: "Interpretando", tono: "pizarra" },
  borrador: { texto: "Borrador", tono: "ambar" },
  ia_fallida: { texto: "IA no disponible", tono: "error" },
  aprobada: { texto: "Aprobada", tono: "musgo" },
  aceptada: { texto: "Aceptada · pedido", tono: "rauli" },
  vencida: { texto: "Vencida", tono: "neutro" },
};

export function EstadoCotizacionEtiqueta({ estado }: { estado: EstadoCotizacion }) {
  const e = mapa[estado];
  return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
}
