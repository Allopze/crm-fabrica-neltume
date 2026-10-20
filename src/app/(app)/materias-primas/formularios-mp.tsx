"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, SlidersHorizontal } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

const campo = `w-full ${campoAlto}`;
const decimal = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".").replace("−", "-"));

function useAccion() {
  const router = useRouter();
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement | null) =>
    iniciar(async () => {
      try {
        await fn();
        setError(null);
        setExito(ok);
        form?.reset();
        router.refresh();
      } catch (e) {
        setExito(null);
        setError(e);
      }
    });
  const aviso = (
    <>
      {exito && <p role="status" className="text-sm text-musgo">{exito}</p>}
      {error ? <ErrorAccion error={error} /> : null}
    </>
  );
  return { ejecutar, pendiente, aviso };
}

/** Recepción de compras (REQ-MP-2). Idempotente: un doble clic no duplica. */
export function FormularioRecepcion({ materias, csrf, inicial, desdeChipax = {} }: {
  materias: { id: string; nombre: string; unidad: string }[]; csrf: string; inicial?: string;
  /** Materias primas que ya entran solas con las facturas de Chipax, con su proveedor (ADR-0021). */
  desdeChipax?: Record<string, string>;
}) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [mpId, setMpId] = useState(materias.some((m) => m.id === inicial) ? inicial! : materias[0]?.id ?? "");
  const unidad = materias.find((m) => m.id === mpId)?.unidad ?? "";
  return (
    <form aria-label="Registrar recepción" className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      ejecutar(() => pedir("POST", "/api/v1/recepciones", {
        csrf, idempotente: true, cuerpo: { materiaPrimaId: mpId, cantidad: decimal(f.get("cantidad")), ...(f.get("referencia") ? { referencia: f.get("referencia") } : {}) },
      }), "Recepción registrada.", form);
    }}>
      <label className="block text-sm font-medium">Materia prima
        <select value={mpId} onChange={(e) => setMpId(e.target.value)} className={`${campo} mt-1.5`}>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </label>
      {desdeChipax[mpId] && (
        <p role="note" className="rounded-md border border-ambar/30 bg-ambar-velo px-3 py-2 text-xs text-ambar">
          Esta materia prima entra sola con las facturas de {desdeChipax[mpId]} (Chipax). Regístrala a mano solo si no viene en una factura.
        </p>
      )}
      <div className="grid grid-cols-[1fr_70px] gap-2">
        <label className="text-sm font-medium">Cantidad<input name="cantidad" required inputMode="decimal" placeholder="0" autoFocus={Boolean(inicial)} className={`${campo} mt-1.5 tabular-nums`} /></label>
        <p className="self-end pb-2.5 font-mono text-xs text-tinta-tenue">{unidad}</p>
      </div>
      <label className="block text-sm font-medium">Guía o factura del proveedor<input name="referencia" placeholder="Ej. guía 18.442" className={`${campo} mt-1.5`} /></label>
      <Boton variante="primario" className="h-10 w-full" type="submit" disabled={pendiente || !mpId}><PackagePlus className="h-4 w-4" /> {pendiente ? "Registrando…" : "Registrar recepción"}</Boton>
      {aviso}
    </form>
  );
}

/** Alta de materia prima (REQ-MP-1). */
export function FormularioNuevaMp({ unidades, csrf }: { unidades: { codigo: string; nombre: string }[]; csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <Boton onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva materia prima</Boton>;
  return (
    <form aria-label="Nueva materia prima" className="grid w-full max-w-xl gap-2 rounded-lg border border-linea-fuerte bg-lamina p-4 sm:grid-cols-[1fr_120px_110px_auto]" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      const minimo = String(f.get("minimo") ?? "");
      ejecutar(() => pedir("POST", "/api/v1/materias-primas", {
        csrf, cuerpo: { nombre: f.get("nombre"), unidadCodigo: f.get("unidad"), stockMinimo: minimo ? decimal(minimo) : null },
      }), "Materia prima creada.", form);
    }}>
      <input name="nombre" required minLength={2} placeholder="Nombre" aria-label="Nombre" className={campo} />
      <select name="unidad" aria-label="Unidad" className={campo}>{unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.codigo} · {u.nombre}</option>)}</select>
      <input name="minimo" inputMode="decimal" placeholder="Mínimo" aria-label="Mínimo" className={campo} />
      <Boton variante="primario" type="submit" disabled={pendiente} className="h-10">{pendiente ? "Creando…" : "Crear"}</Boton>
      <div className="sm:col-span-4">{aviso}</div>
    </form>
  );
}

/** Ajuste de materia prima con motivo (REQ-MP-5): crea un movimiento inmutable; nunca edita la existencia. */
export function FormularioAjusteMp({ materias, csrf }: { materias: { id: string; nombre: string; unidad: string }[]; csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [mpId, setMpId] = useState(materias[0]?.id ?? "");
  const unidad = materias.find((m) => m.id === mpId)?.unidad ?? "";
  return (
    <form aria-label="Ajuste de materia prima" className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      ejecutar(() => pedir("POST", "/api/v1/movimientos/ajustes", {
        csrf, idempotente: true, cuerpo: { materiaPrimaId: mpId, cantidad: decimal(f.get("cantidad")), motivo: String(f.get("motivo") ?? "") },
      }), "Ajuste registrado.", form);
    }}>
      <label className="block text-sm font-medium">Materia prima
        <select value={mpId} onChange={(e) => setMpId(e.target.value)} className={`${campo} mt-1.5`}>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_70px] gap-2">
        <label className="text-sm font-medium">Cantidad (+ suma, − resta)<input name="cantidad" required inputMode="decimal" placeholder="-2,5" className={`${campo} mt-1.5 tabular-nums`} /></label>
        <p className="self-end pb-2.5 font-mono text-xs text-tinta-tenue">{unidad}</p>
      </div>
      <label className="block text-sm font-medium">Motivo<input name="motivo" required minLength={3} maxLength={300} placeholder="Ej. conteo físico, merma por humedad" className={`${campo} mt-1.5`} /></label>
      <Boton className="h-10 w-full" type="submit" disabled={pendiente || !mpId}><SlidersHorizontal className="h-4 w-4" /> {pendiente ? "Registrando…" : "Registrar ajuste"}</Boton>
      {aviso}
    </form>
  );
}
