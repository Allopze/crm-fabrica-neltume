import Link from "next/link";
import { cn } from "@/lib/formato";

const PESTANAS = [
  { id: "articulos", texto: "Artículos", href: "/stock" },
  { id: "puertas", texto: "Puertas", href: "/stock/puertas" },
  { id: "historico", texto: "Despachos anteriores", href: "/stock/historico" },
] as const;

/** Stock por artículo, puerta por puerta (ADR-0018) y el historial de la planilla anterior a la app. */
export function PestanasStock({ actual }: { actual: (typeof PESTANAS)[number]["id"] }) {
  return (
    <nav aria-label="Secciones de stock" className="mb-6 flex flex-wrap gap-1 border-b border-linea">
      {PESTANAS.map((p) => (
        <Link key={p.id} href={p.href} aria-current={actual === p.id ? "page" : undefined}
          className={cn("-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm pointer-coarse:py-3.5",
            actual === p.id ? "border-rauli font-medium text-tinta" : "border-transparent text-tinta-suave hover:text-tinta")}>
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
