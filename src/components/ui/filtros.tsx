"use client";

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/formato";

/**
 * Filtros de una lista que se aplican solos, como las pestañas de estado (UX §1): el texto espera a que se deje de
 * escribir; selectores, casillas y fechas aplican al cambiar. Enter aplica de inmediato. La URL guarda los filtros.
 */
export function Filtros({ etiqueta = "Filtros", className, children }: { etiqueta?: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const espera = useRef<number | undefined>(undefined);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    const aplicar = (demora: number) => {
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => {
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(f)) if (typeof v === "string" && v.trim()) params.append(k, v.trim());
        iniciar(() => router.replace(params.size ? `${ruta}?${params}` : ruta, { scroll: false }));
      }, demora);
    };
    const esTexto = (t: EventTarget | null) => t instanceof HTMLInputElement && (t.type === "search" || t.type === "text") && Boolean(t.name);
    const alEscribir = (e: Event) => { if (esTexto(e.target)) aplicar(400); };
    const alCambiar = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name && !esTexto(t)) aplicar(0);
    };
    const alEnviar = (e: Event) => { e.preventDefault(); aplicar(0); };
    f.addEventListener("input", alEscribir);
    f.addEventListener("change", alCambiar);
    f.addEventListener("submit", alEnviar);
    return () => {
      window.clearTimeout(espera.current);
      f.removeEventListener("input", alEscribir);
      f.removeEventListener("change", alCambiar);
      f.removeEventListener("submit", alEnviar);
    };
  }, [router, ruta]);

  return (
    <form ref={form} aria-label={etiqueta} aria-busy={pendiente || undefined} className={cn("flex flex-wrap items-center gap-2", className ?? "mb-5")}>
      {children}
      {pendiente && <span className="text-xs text-tinta-tenue">Actualizando…</span>}
    </form>
  );
}
