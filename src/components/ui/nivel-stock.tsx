import { cn } from "@/lib/formato";

/** Barra de nivel: existencia sobre el mínimo, con la parte reservada rayada (UX §4). */
export function NivelStock({ existencia, reservado, minimo }: { existencia: number; reservado: number; minimo: number | null }) {
  const tope = Math.max(existencia, minimo ?? 0, 1) * 1.25;
  const bajo = minimo !== null && existencia - reservado < minimo;
  return (
    <div className="relative h-2 w-28 rounded-full bg-papel-hundido" aria-hidden>
      <div className={cn("absolute inset-y-0 left-0 rounded-full", bajo ? "bg-ambar" : "bg-musgo")} style={{ width: `${(existencia / tope) * 100}%` }} />
      <div className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.25)_0_2px,transparent_2px_4px)]"
        style={{ left: `${((existencia - reservado) / tope) * 100}%`, width: `${(reservado / tope) * 100}%` }} />
      {minimo !== null && <div className="absolute -top-1 -bottom-1 w-px bg-tinta" style={{ left: `${(minimo / tope) * 100}%` }} title="Mínimo" />}
    </div>
  );
}
