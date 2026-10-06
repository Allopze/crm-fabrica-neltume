"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

/** Mientras la IA interpreta: refresca cada segundo; pasados 30 s ofrece seguir a mano (UX §3). */
export function EsperaInterpretacion({ texto }: { texto: string }) {
  const router = useRouter();
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const t = setInterval(() => { setSegundos((s) => s + 1); router.refresh(); }, 1_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="relative overflow-hidden rounded-lg border border-linea bg-papel-hundido/50 p-6">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">Texto original · tal como llegó</h2>
        <p className="whitespace-pre-wrap font-display text-[1.2rem] leading-[1.85] text-tinta-suave">{texto}</p>
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="escaneo h-full w-full bg-gradient-to-b from-transparent via-[var(--rauli-velo)] to-transparent opacity-70" />
        </div>
      </section>
      <section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-linea-fuerte p-10 text-center" role="status" aria-live="polite">
        <Sparkles className="h-6 w-6 text-rauli" />
        <p className="font-display text-xl">Interpretando el pedido…</p>
        <p className="text-sm text-tinta-suave">{segundos < 30 ? "Suele tardar hasta 15 segundos." : "Está tardando más de lo normal. Puedes esperar o recargar más tarde."}</p>
      </section>
    </div>
  );
}
