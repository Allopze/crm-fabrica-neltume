import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { numero } from "@/lib/formato";

/**
 * Pie de una lista paginada: cuántos hay en total con los filtros, volver al principio y la página siguiente
 * (UX §1). `inicio` solo se pasa cuando ya no se está en la primera página.
 */
export function Paginacion({ total, singular, plural, inicio, siguiente, etiquetaSiguiente = "Siguientes" }: {
  total: number; singular: string; plural: string; inicio?: string; siguiente?: string | null; etiquetaSiguiente?: string;
}) {
  if (!inicio && !siguiente && total <= 0) return null;
  return (
    <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-tinta-tenue tabular-nums">{numero(total)} {total === 1 ? singular : plural}</p>
      <div className="flex items-center gap-1">
        {inicio && (
          <Link href={inicio} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-tinta-suave hover:bg-papel-hundido hover:text-tinta pointer-coarse:min-h-11">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio
          </Link>
        )}
        {siguiente && (
          <Link href={siguiente} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-linea-fuerte bg-lamina px-3 text-tinta hover:border-tinta pointer-coarse:min-h-11">
            {etiquetaSiguiente} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </nav>
  );
}
