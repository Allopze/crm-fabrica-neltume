"use client";

import { useEffect, useState } from "react";
import { clp } from "@/lib/formato";

interface Opcion { codigo: string; modelo: string; madera: string; ancho: string; altoM: number; precioVenta: number }

/** Busca artículos en la lista vigente (código o modelo) y devuelve el código elegido. */
export function SelectorArticulo({ version, onElegir, etiqueta = "Buscar artículo del catálogo" }: { version: number | null; onElegir: (codigo: string) => void; etiqueta?: string }) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);

  useEffect(() => {
    if (!version || q.trim().length < 2) return;
    const control = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/listas-precio/${version}?${new URLSearchParams({ q: q.trim(), limite: "8" })}`, { signal: control.signal });
        if (r.ok) setOpciones((await r.json()).datos);
      } catch {
        // búsqueda cancelada o sin conexión: se ignora
      }
    }, 250);
    return () => { clearTimeout(t); control.abort(); };
  }, [q, version]);

  return (
    <div className="relative min-w-60 flex-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o modelo (p. ej. NEL-R-4-B)" aria-label={etiqueta}
        className="h-9 w-full rounded-md border border-linea-fuerte bg-lamina px-3 font-mono text-sm uppercase placeholder:normal-case focus:border-tinta focus:outline-none" />
      {q.trim().length >= 2 && opciones.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-linea-fuerte bg-lamina shadow-lg">
          {opciones.map((o) => (
            <li key={o.codigo}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onElegir(o.codigo); setQ(""); setOpciones([]); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-papel">
                <span><span className="font-mono">{o.codigo}</span> <span className="capitalize text-tinta-suave">{o.modelo.toLowerCase()} · {o.madera.toLowerCase()}</span></span>
                <span className="tabular-nums text-tinta-tenue">{clp(o.precioVenta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
