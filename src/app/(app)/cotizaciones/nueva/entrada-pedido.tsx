"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Boton, BotonLink } from "@/components/ui/base";
import { cotizacionDemo, clientes } from "@/mock/comercial";

type Fase = "escribiendo" | "interpretando" | "fallida";
const LIMITE = 4000;

export function EntradaPedido() {
  const router = useRouter();
  const [texto, setTexto] = useState(cotizacionDemo.textoOriginal);
  const [fase, setFase] = useState<Fase>("escribiendo");

  // Prototipo: simula la interpretación y abre el borrador de ejemplo.
  function interpretar() {
    setFase("interpretando");
    window.setTimeout(() => router.push(`/cotizaciones/${cotizacionDemo.id}`), 2200);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="entrada entrada-2">
        <div className="relative overflow-hidden rounded-lg border border-linea-fuerte bg-lamina shadow-[0_18px_40px_-30px_rgb(30_40_30/0.5)] focus-within:border-tinta">
          <div className="flex items-center justify-between border-b border-linea px-5 py-2.5">
            <label htmlFor="pedido" className="font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">Texto del cliente</label>
            <span className="font-mono text-[11px] tabular-nums text-tinta-tenue">{texto.length.toLocaleString("es-CL")} / 4.000</span>
          </div>
          <textarea
            id="pedido"
            value={texto}
            maxLength={LIMITE}
            onChange={(e) => setTexto(e.target.value)}
            disabled={fase === "interpretando"}
            rows={11}
            placeholder="Pega aquí el correo o mensaje del cliente, tal cual llegó…"
            className="block w-full resize-none bg-transparent px-5 py-4 font-display text-[1.15rem] leading-relaxed text-tinta placeholder:text-tinta-tenue focus:outline-none disabled:opacity-60"
          />
          {fase === "interpretando" && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 bottom-0 overflow-hidden">
              <div className="escaneo h-full w-full bg-gradient-to-b from-transparent via-[var(--rauli-velo)] to-transparent opacity-70" />
            </div>
          )}
        </div>

        {fase === "fallida" && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-4 rounded-md border border-error/25 bg-error-velo px-4 py-3 text-sm text-error">
            <span className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>No pudimos interpretar el pedido.</strong> El servicio de IA no respondió a tiempo. Tu texto quedó guardado.</span>
            </span>
            <BotonLink href="/cotizaciones/manual" variante="peligro">Cotizar a mano</BotonLink>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Boton variante="primario" className="h-11 px-5 text-[15px]" onClick={interpretar} disabled={!texto.trim() || fase === "interpretando"}>
            <Sparkles className="h-4 w-4" />
            {fase === "interpretando" ? "Interpretando pedido… (hasta 15 s)" : "Interpretar pedido"}
          </Boton>
          <BotonLink href="/cotizaciones/manual" variante="fantasma"><PencilLine className="h-4 w-4" /> Prefiero cotizar a mano</BotonLink>
          <button onClick={() => setFase("fallida")} className="ml-auto text-xs text-tinta-tenue underline decoration-dotted">
            Simular falla de IA
          </button>
        </div>
      </div>

      <aside className="entrada entrada-3 space-y-6">
        <div>
          <label htmlFor="cliente" className="text-sm font-medium">Cliente</label>
          <select id="cliente" defaultValue="cl-2"
            className="mt-1.5 h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none">
            <option value="">Elegir después</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-tinta-tenue">El cliente nunca se envía a la IA.</p>
        </div>

        <div className="rounded-lg border border-linea bg-papel-hundido/60 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-musgo" /> Qué ve la IA</p>
          <ul className="mt-3 space-y-2 text-tinta-suave">
            <li>— El texto, con RUT, correos y teléfonos ocultos.</li>
            <li>— El catálogo de modelos, maderas y medidas.</li>
            <li className="text-tinta">— Nunca precios, costos, stock ni datos del cliente.</li>
          </ul>
          <div className="regla my-4 opacity-60" aria-hidden />
          <p className="text-tinta-suave">Lo que no entienda con certeza queda <strong className="text-ambar">por confirmar</strong>. Tú apruebas antes de que salga.</p>
        </div>
      </aside>
    </div>
  );
}
