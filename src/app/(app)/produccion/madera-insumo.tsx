"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/dropdown";
import { pedir } from "@/lib/api-cliente";

/** Materia prima de la que se descuenta cada madera cuando un BOM usa la «madera de la puerta» (REQ-MP-3.5, ADR-0012). */
export function MaderaInsumo({ maderas, materias, editable, csrf }: {
  maderas: { codigo: string; nombre: string; materiaPrimaId: string | null }[];
  materias: { id: string; nombre: string; unidad: string }[];
  editable: boolean; csrf: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = (codigo: string, materiaPrimaId: string) => iniciar(async () => {
    try {
      setError(null);
      setGuardada(null);
      await pedir("PUT", `/api/v1/maderas/${codigo}/insumo`, { csrf, cuerpo: { materiaPrimaId: materiaPrimaId || null } });
      setGuardada(codigo);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  });

  return (
    <div>
      <ul className="divide-y divide-linea/70">
        {maderas.map((m) => (
          <li key={m.codigo} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1">{m.nombre}{guardada === m.codigo && <span role="status" className="ml-2 text-xs normal-case text-musgo">guardado</span>}</span>
            <Dropdown aria-label={`Materia prima de ${m.nombre}`} disabled={!editable || pendiente} value={m.materiaPrimaId ?? ""}
              onChange={(materiaPrimaId) => guardar(m.codigo, materiaPrimaId)} className="w-full sm:w-64">
              <option value="">— sin asociar —</option>
              {materias.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad})</option>)}
            </Dropdown>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
