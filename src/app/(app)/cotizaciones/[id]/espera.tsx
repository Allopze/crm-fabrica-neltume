"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, PencilLine, RotateCcw, Sparkles } from "lucide-react";
import { Boton, BotonLink } from "@/components/ui/base";

const TOPE_S = 30;

/** Mientras la IA interpreta: consulta un estado ligero cada 2 s hasta 30 s y solo recarga al terminar (UX §3). */
export function EsperaInterpretacion({ id, texto }: { id: string; texto: string }) {
  const router = useRouter();
  const [segundos, setSegundos] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const agotado = segundos >= TOPE_S;

  useEffect(() => {
    if (agotado) return;
    const control = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/cotizaciones/${id}/estado`, { signal: control.signal, cache: "no-store" });
        if (!r.ok) throw new Error("sin estado");
        const datos = await r.json() as { estado?: string };
        if (datos.estado && datos.estado !== "interpretando") { router.refresh(); return; }
      } catch {
        // Un corte momentáneo se reintenta en el siguiente ciclo; el tope de 30 s sigue vigente.
      }
      if (!control.signal.aborted) setSegundos((s) => s + 1);
    }, 2_000);
    return () => { clearTimeout(t); control.abort(); };
  }, [id, router, segundos, agotado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="relative overflow-hidden rounded-lg border border-linea bg-papel-hundido/50 p-6">
        <h2 className="mb-4 text-sm font-semibold text-tinta-suave">Texto original · tal como llegó</h2>
        <p className="whitespace-pre-wrap font-display text-[1.2rem] leading-[1.85] text-tinta-suave">{texto}</p>
        {!agotado && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="escaneo h-full w-full bg-gradient-to-b from-transparent via-[var(--rauli-velo)] to-transparent opacity-70" />
          </div>
        )}
      </section>
      <section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-linea-fuerte p-10 text-center" role="status" aria-live="polite">
        <Sparkles className="h-6 w-6 text-rauli" />
        {agotado ? (
          <>
            <p className="font-display text-xl">La IA está tardando más de lo normal</p>
            <p className="max-w-sm text-sm text-tinta-suave">El pedido sigue en cola. Puedes volver a consultar o cotizarlo a mano; copia el texto para tenerlo a la vista.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Boton onClick={() => setSegundos(0)}><RotateCcw className="h-4 w-4" /> Volver a consultar</Boton>
              <Boton variante="fantasma" onClick={copiar}><Copy className="h-4 w-4" /> {copiado ? "Texto copiado" : "Copiar texto"}</Boton>
              <BotonLink href="/cotizaciones/manual" variante="primario"><PencilLine className="h-4 w-4" /> Cotizar a mano</BotonLink>
            </div>
          </>
        ) : (
          <>
            <p className="font-display text-xl">Interpretando el pedido…</p>
            <p className="text-sm text-tinta-suave">Suele tardar hasta 15 segundos.</p>
          </>
        )}
      </section>
    </div>
  );
}
