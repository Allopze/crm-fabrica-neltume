"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * Entrada «desde texto» siempre a mano (UX §1), con estilo secundario para no competir con la acción principal de
 * cada pantalla. En la propia pantalla de nueva cotización no hace falta.
 */
export function AccesoCotizar() {
  if (usePathname() === "/cotizaciones/nueva") return null;
  return (
    <Link href="/cotizaciones/nueva"
      className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-rauli/35 bg-lamina px-3.5 text-sm font-medium text-rauli-hondo hover:border-rauli hover:bg-rauli-velo pointer-coarse:h-11">
      <Plus className="h-4 w-4" /> Nueva cotización
    </Link>
  );
}
