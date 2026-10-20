"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, PackagePlus, Plus, RefreshCw } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { cantidad as fmtCantidad, cn } from "@/lib/formato";

function useAccion() {
  const router = useRouter();
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<unknown>, ok: string, despues?: () => void) => iniciar(async () => {
    try {
      await fn();
      setError(null);
      setExito(ok);
      despues?.();
      router.refresh();
    } catch (e) {
      setExito(null);
      setError(e);
    }
  });
  const aviso = (
    <>
      {exito && <p role="status" className="text-sm text-musgo">{exito}</p>}
      {error ? <ErrorAccion error={error} className="px-2 py-1 text-xs" /> : null}
    </>
  );
  return { ejecutar, pendiente, aviso };
}

/** «Sincronizar ahora» (REQ-MP-7.7): deja la petición; el servicio de compras la toma en segundos. */
export function SincronizarAhora({ csrf, enCurso }: { csrf: string; enCurso: boolean }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  return (
    <div className="flex flex-col items-end gap-1">
      <Boton variante="primario" disabled={pendiente || enCurso} onClick={() => ejecutar(() => pedir("POST", "/api/v1/compras/sincronizar", { csrf, idempotente: true }), "Sincronización pedida.")}>
        <RefreshCw className={cn("h-4 w-4", (pendiente || enCurso) && "animate-spin motion-reduce:animate-none")} /> {pendiente ? "Pidiendo…" : enCurso ? "Sincronizando…" : "Sincronizar ahora"}
      </Boton>
      {aviso}
    </div>
  );
}

/**
 * Una línea por asociar (REQ-MP-7.3): materia prima y factor (unidades nuestras por unidad facturada), con la
 * conversión a la vista. Vale para todas las líneas pendientes del mismo ítem del proveedor.
 */
export function AsociarLinea({ id, item, cantidad, unidad, materias, csrf }: {
  id: string; item: string; cantidad: number | null; unidad: string | null; materias: { id: string; nombre: string; unidad: string }[]; csrf: string;
}) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [mpId, setMpId] = useState("");
  const [factor, setFactor] = useState("1");
  const f = Number(factor.replace(",", "."));
  const mp = materias.find((m) => m.id === mpId);
  const valido = Boolean(mp) && f > 0;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-tinta-tenue">Materia prima
          <select value={mpId} onChange={(e) => setMpId(e.target.value)} aria-label={`Materia prima para ${item}`} className={cn(campo, "mt-1 block w-56")}>
            <option value="">Elige…</option>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
          </select>
        </label>
        <label className="text-xs text-tinta-tenue">{mp ? `${mp.unidad} por ${unidad ?? "unidad"}` : "Factor"}
          <input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" aria-label={`Factor para ${item}`} className={cn(campo, "mt-1 block w-24 tabular-nums")} />
        </label>
        <Boton variante="primario" disabled={!valido || pendiente}
          onClick={() => ejecutar(() => pedir("POST", `/api/v1/compras/lineas/${id}/asociar`, { csrf, idempotente: true, cuerpo: { materiaPrimaId: mpId, factor: f } }), "Ítem asociado: las líneas de ese ítem entraron al stock.")}>
          <PackagePlus className="h-4 w-4" /> Asociar y recibir
        </Boton>
        <Boton variante="fantasma" disabled={pendiente}
          onClick={() => ejecutar(() => pedir("POST", `/api/v1/compras/lineas/${id}/ignorar`, { csrf, idempotente: true }), "Marcado como «no es materia prima».")}>
          <Ban className="h-4 w-4" /> No es materia prima
        </Boton>
      </div>
      {valido && cantidad !== null && (
        <p className="text-xs tabular-nums text-tinta-suave">{fmtCantidad(cantidad)} {unidad ?? ""} × {fmtCantidad(f)} = <strong>{fmtCantidad(Math.round(cantidad * f * 1000) / 1000)} {mp!.unidad}</strong> de {mp!.nombre}</p>
      )}
      {aviso}
    </div>
  );
}

/** Proveedores cuyas facturas se leen de Chipax (REQ-MP-7.1): se habilitan desde hoy. */
export function NuevoProveedor({ csrf }: { csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  return (
    <form aria-label="Habilitar proveedor" className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const d = new FormData(form);
      ejecutar(() => pedir("POST", "/api/v1/proveedores-compra", { csrf, idempotente: true, cuerpo: { rut: String(d.get("rut") ?? ""), nombre: String(d.get("nombre") ?? "") } }),
        "Proveedor habilitado: se leerán sus facturas desde hoy.", () => form.reset());
    }}>
      <div className="grid grid-cols-[8.5rem_1fr] gap-2">
        <input name="rut" required placeholder="76.123.456-7" aria-label="RUT del proveedor" className={cn(campo, "w-full min-w-0")} />
        <input name="nombre" required maxLength={160} placeholder="Nombre" aria-label="Nombre del proveedor" className={cn(campo, "w-full min-w-0")} />
      </div>
      <Boton type="submit" disabled={pendiente}><Plus className="h-4 w-4" /> Habilitar proveedor</Boton>
      {aviso}
    </form>
  );
}

export function ActivarProveedor({ rut, activo, csrf }: { rut: string; activo: boolean; csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  return (
    <div className="inline-flex flex-col items-end">
      <button type="button" disabled={pendiente} className="-my-2 py-2 text-xs text-rauli hover:underline disabled:opacity-50"
        onClick={() => ejecutar(() => pedir("PATCH", `/api/v1/proveedores-compra/${rut}`, { csrf, cuerpo: { activo: !activo } }), activo ? "Proveedor desactivado." : "Proveedor reactivado desde hoy.")}>
        {activo ? "Desactivar" : "Reactivar"}
      </button>
      {aviso}
    </div>
  );
}
