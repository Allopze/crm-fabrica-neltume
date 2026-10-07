import { Etiqueta } from "@/components/ui/base";
import type { PuertaListada } from "@/domain/puertas/consulta";
import { metros } from "@/lib/formato";

const mm3 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

/** Medida exacta de la puerta (ancho en cm × alto en m, como la anota la fábrica) o, si no se conoce, la de su artículo. */
export function medidaPuerta(p: Pick<PuertaListada, "anchoMm" | "altoMm" | "ancho" | "altoM">): string {
  if (p.anchoMm && p.altoMm) return `${mm3.format(p.anchoMm / 10)} × ${mm3.format(p.altoMm / 1000)}`;
  return `${p.ancho} × ${metros(Number(p.altoM))}`;
}

/** En stock, apartada, despachada o dada de baja: sale de los movimientos de la puerta. */
export function EstadoPuerta({ p }: { p: Pick<PuertaListada, "existencia" | "apartada" | "salida"> }) {
  if (p.existencia === 1 && p.apartada === 1) return <Etiqueta tono="pizarra">Apartada</Etiqueta>;
  if (p.existencia === 1) return <Etiqueta tono="musgo">En stock</Etiqueta>;
  return <Etiqueta>{p.salida === "salida_despacho" ? "Despachada" : "Dada de baja"}</Etiqueta>;
}

export function Calidad({ calidad }: { calidad: string }) {
  return calidad === "segunda" ? <span className="rounded-full bg-ambar-velo px-1.5 text-xs text-ambar">de segunda</span> : null;
}
