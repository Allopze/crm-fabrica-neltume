"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/api-cliente";

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-2 text-sm focus:border-tinta focus:outline-none disabled:opacity-60";

/** Materia prima de la que se descuenta cada madera cuando un BOM usa la «madera de la puerta» (REQ-MP-3.5, ADR-0012). */
export function MaderaInsumo({ maderas, materias, editable, csrf }: {
  maderas: { codigo: string; nombre: string; materiaPrimaId: string | null }[];
  materias: { id: string; nombre: string; unidad: string }[];
  editable: boolean; csrf: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = (codigo: string, materiaPrimaId: string) => iniciar(async () => {
    try {
      setError(null);
      await pedir("PUT", `/api/v1/maderas/${codigo}/insumo`, { csrf, cuerpo: { materiaPrimaId: materiaPrimaId || null } });
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  });

  return (
    <div>
      <ul className="divide-y divide-linea/70">
        {maderas.map((m) => (
          <li key={m.codigo} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="capitalize">{m.nombre.toLowerCase()}</span>
            <select aria-label={`Materia prima de ${m.nombre.toLowerCase()}`} disabled={!editable || pendiente} value={m.materiaPrimaId ?? ""}
              onChange={(e) => guardar(m.codigo, e.target.value)} className={`${campo} w-64`}>
              <option value="">— sin asociar —</option>
              {materias.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad})</option>)}
            </select>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
