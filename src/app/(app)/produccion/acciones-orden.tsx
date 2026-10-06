"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Plus, TriangleAlert } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";
import { numero } from "@/lib/formato";

const campo = "h-10 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

function useEnvio() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<unknown>, alTerminar?: () => void) => iniciar(async () => {
    try { setError(null); await fn(); alTerminar?.(); router.refresh(); } catch (e) { setError((e as Error).message); }
  });
  return { enviar, pendiente, error };
}

export function NuevaOrden({ csrf }: { csrf: string }) {
  const { enviar, pendiente, error } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <Boton variante="primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva orden</Boton>;
  return (
    <form aria-label="Nueva orden" className="flex flex-wrap items-end gap-2 rounded-lg border border-linea-fuerte bg-lamina p-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      enviar(() => pedir("POST", "/api/v1/ordenes", { csrf, idempotente: true, cuerpo: { lineas: [{ codigo: String(f.get("codigo")), cantidad: Number(f.get("cantidad")) }] } }), () => setAbierto(false));
    }}>
      <label className="text-sm">Artículo<input name="codigo" required placeholder="NEL-R-4-B" className={`${campo} mt-1 block w-40 font-mono uppercase`} /></label>
      <label className="text-sm">Cantidad<input name="cantidad" required inputMode="numeric" className={`${campo} mt-1 block w-24`} /></label>
      <Boton type="submit" variante="primario" disabled={pendiente} className="h-10">Crear orden</Boton>
      <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)} className="h-10">Cancelar</Boton>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}

interface Insumo { materiaPrimaId: string; nombre: string; unidad: string; usa: number; existencia: number; faltante: number }

/** Vista previa y cierre de una orden (UX §4): muestra consumos y faltantes antes de confirmar. */
export function CierreOrden({ ordenId, numero: num, insumos, sinBom, incompletos, demo, materias, csrf }: {
  ordenId: string; numero: number; insumos: Insumo[]; sinBom: string[]; incompletos: string[]; demo: boolean; materias: { id: string; nombre: string; unidad: string }[]; csrf: string;
}) {
  const { enviar, pendiente, error } = useEnvio();
  const [manual, setManual] = useState<{ materiaPrimaId: string; cantidad: string }>({ materiaPrimaId: materias[0]?.id ?? "", cantidad: "" });
  const faltan = insumos.some((i) => i.faltante > 0);
  const cuerpo = sinBom.length && manual.cantidad ? { consumosManuales: [{ materiaPrimaId: manual.materiaPrimaId, cantidad: Number(manual.cantidad.replace(",", ".")) }] } : {};

  return (
    <div>
      {incompletos.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-error/30 bg-error-velo p-3 text-sm text-error">
          <p className="font-medium">No se puede calcular la madera de la puerta:</p>
          <ul className="mt-1 list-disc pl-5">{incompletos.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-1">Asocia cada madera a su materia prima en «Madera de la puerta», más abajo.</p>
        </div>
      )}
      {sinBom.length > 0 && (
        <div className="mb-4 rounded-md border border-ambar/30 bg-ambar-velo p-3 text-sm text-ambar">
          <p className="font-medium">Sin BOM: {sinBom.join(", ")}. Registra el consumo a mano:</p>
          <div className="mt-2 flex gap-2">
            <select aria-label="Materia prima consumida" value={manual.materiaPrimaId} onChange={(e) => setManual({ ...manual, materiaPrimaId: e.target.value })} className={`${campo} h-9 flex-1`}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
            </select>
            <input aria-label="Cantidad consumida" inputMode="decimal" value={manual.cantidad} onChange={(e) => setManual({ ...manual, cantidad: e.target.value })} className={`${campo} h-9 w-24`} />
          </div>
        </div>
      )}
      {insumos.length > 0 && (
        <ul className="divide-y divide-linea/70 rounded-md border border-linea">
          {insumos.map((i) => (
            <li key={i.materiaPrimaId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{i.nombre}</span>
              <span className="font-mono tabular-nums">
                <span className="text-error">−{numero(i.usa)}</span> <span className="text-tinta-tenue">{i.unidad} · hay {numero(i.existencia)}</span>
                {i.faltante > 0 && <span className="ml-2 inline-flex items-center gap-1 text-error"><TriangleAlert className="h-3.5 w-3.5" /> faltan {numero(i.faltante)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Boton variante="primario" className="mt-5 h-10 w-full" disabled={pendiente || faltan || incompletos.length > 0 || (sinBom.length > 0 && !manual.cantidad)}
        onClick={() => enviar(() => pedir("POST", `/api/v1/ordenes/${ordenId}/cerrar`, { csrf, idempotente: true, cuerpo }))}>
        <CheckCheck className="h-4 w-4" /> Cerrar orden {num} y mover stock
      </Boton>
      <p className="mt-2 text-xs text-tinta-tenue">Todo o nada: si falta un insumo, no se mueve nada.{demo && " Usa un BOM de DEMOSTRACIÓN."}</p>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
