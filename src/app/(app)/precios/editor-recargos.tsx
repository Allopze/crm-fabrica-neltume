"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Etiqueta } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

const TIPOS = ["BLOQUE", "PANEL", "ESPECIAL", "ACCESORIOS"] as const;
type Tipo = (typeof TIPOS)[number];

/** Recargos por tipo de puerta (REQ-COT-1.3). Guardar crea una versión nueva de la lista. */
export function EditorRecargos({ recargos, csrf, puedeEditar }: { recargos: Record<Tipo, number>; csrf: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [valores, setValores] = useState(() => Object.fromEntries(TIPOS.map((t) => [t, String(Math.round(recargos[t] * 1000) / 10)])) as Record<Tipo, string>);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiados = TIPOS.filter((t) => Number(valores[t].replace(",", ".")) / 100 !== recargos[t]);

  function guardar() {
    iniciar(async () => {
      try {
        const r = await pedir<{ version: number }>("POST", "/api/v1/listas-precio", {
          csrf, idempotente: true, cuerpo: { recargos: cambiados.map((t) => ({ tipo: t, porcentaje: Number(valores[t].replace(",", ".")) / 100 })) },
        });
        setMsg({ ok: true, texto: `Guardado: lista v${r.version}` });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, texto: (e as Error).message });
      }
    });
  }

  return (
    <div>
      <ul className="space-y-3">
        {TIPOS.map((t) => (
          <li key={t} className="flex items-center gap-4">
            <label htmlFor={`rec-${t}`} className="w-24 text-sm capitalize">{t.toLowerCase()}</label>
            <span className="relative h-1.5 flex-1 rounded-full bg-papel-hundido" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-rauli" style={{ width: `${Math.min(Number(valores[t].replace(",", ".")) || 0, 100) * 2.5}%` }} />
            </span>
            <span className="flex items-center gap-1">
              <input id={`rec-${t}`} inputMode="decimal" disabled={!puedeEditar} value={valores[t]}
                onChange={(e) => setValores({ ...valores, [t]: e.target.value.replace(/[^\d,.]/g, "") })}
                className="h-9 w-16 rounded-md border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm tabular-nums disabled:border-transparent disabled:bg-transparent pointer-coarse:h-11" />
              <span className="text-sm text-tinta-tenue">%</span>
            </span>
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <div className="mt-4 flex items-center gap-3">
          <Boton variante="primario" disabled={!cambiados.length || pendiente} onClick={guardar}>Guardar (nueva versión)</Boton>
          {msg && <Etiqueta tono={msg.ok ? "musgo" : "error"}>{msg.texto}</Etiqueta>}
        </div>
      )}
      <p className="mt-3 text-xs text-tinta-tenue">Se aplican sobre el precio neto de lista. Las cotizaciones aprobadas no cambian.</p>
    </div>
  );
}
