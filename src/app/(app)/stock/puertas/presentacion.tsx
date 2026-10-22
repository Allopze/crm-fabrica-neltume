import { Etiqueta } from "@/components/ui/base";
import type { PuertaListada } from "@/domain/puertas/consulta";
import { metros, metrosDesdeMm, nombrePropio } from "@/lib/formato";

/** «Apartada para MIREYA OBANDO» → «Apartada para Mireya Obando»: la planilla trae los nombres en mayúsculas. */
export const textoApartada = (texto: string) => texto.replace(/^(apartada )?(para )(.+)$/i, (_, a = "", para: string, nombre: string) => a + para + nombrePropio(nombre));

/**
 * Medida exacta de la puerta en metros, como el resto del catálogo («0,90 × 2,00»), o, si no se conoce, la de su
 * artículo. La planilla la anota en cm × m («90 × 2»); mezclar unidades en una misma cifra confunde.
 */
export function medidaPuerta(p: Pick<PuertaListada, "anchoMm" | "altoMm" | "ancho" | "altoM">): string {
  if (p.anchoMm && p.altoMm) return `${metrosDesdeMm(p.anchoMm)} × ${metrosDesdeMm(p.altoMm)}`;
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
