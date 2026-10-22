"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, SlidersHorizontal } from "lucide-react";
import { Boton, Hecho } from "@/components/ui/base";
import { PanelLateral } from "@/components/ui/panel-lateral";
import { campoAlto } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
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
      {exito && <Hecho>{exito}</Hecho>}
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
  // Sin elección previa: una materia prima ya puesta parece elegida y facilita registrar en la equivocada.
  const [mpId, setMpId] = useState(materias.some((m) => m.id === inicial) ? inicial! : "");
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
      <div className="block text-sm font-medium">Materia prima
        <Dropdown aria-label="Materia prima" value={mpId} onChange={setMpId} className="mt-1.5 w-full">
          <option value="">Elige una materia prima…</option>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </Dropdown>
      </div>
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

/** Alta de materia prima (REQ-MP-1), en un panel lateral para no mover el encabezado. */
export function FormularioNuevaMp({ unidades, csrf }: { unidades: { codigo: string; nombre: string }[]; csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva materia prima</Boton>
      <PanelLateral abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Nueva materia prima" descripcion="Nombre, unidad de medida y, si quieres, el mínimo que avisa cuando hay que reponer.">
        <form aria-label="Nueva materia prima" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          const minimo = String(f.get("minimo") ?? "");
          ejecutar(() => pedir("POST", "/api/v1/materias-primas", {
            csrf, cuerpo: { nombre: f.get("nombre"), unidadCodigo: f.get("unidad"), stockMinimo: minimo ? decimal(minimo) : null },
          }), "Materia prima creada.", form);
        }}>
          <label className="block text-sm font-medium">Nombre<input name="nombre" required minLength={2} placeholder='Ej. Tabla raulí 1"' aria-label="Nombre" className={`${campo} mt-1.5`} /></label>
          <div className="block text-sm font-medium">Unidad
            <Dropdown name="unidad" aria-label="Unidad" className="mt-1.5 w-full">{unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.codigo} · {u.nombre}</option>)}</Dropdown>
          </div>
          <label className="block text-sm font-medium">Mínimo (opcional)<input name="minimo" inputMode="decimal" placeholder="Sin mínimo" aria-label="Mínimo" className={`${campo} mt-1.5 tabular-nums`} /></label>
          <Boton variante="primario" type="submit" disabled={pendiente} className="h-10 w-full">{pendiente ? "Creando…" : "Crear"}</Boton>
          {aviso}
        </form>
      </PanelLateral>
    </>
  );
}

/** Ajuste de materia prima con motivo (REQ-MP-5): crea un movimiento inmutable; nunca edita la existencia. */
export function FormularioAjusteMp({ materias, csrf }: { materias: { id: string; nombre: string; unidad: string }[]; csrf: string }) {
  const { ejecutar, pendiente, aviso } = useAccion();
  const [mpId, setMpId] = useState("");
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
      <div className="block text-sm font-medium">Materia prima
        <Dropdown aria-label="Materia prima" value={mpId} onChange={setMpId} className="mt-1.5 w-full">
          <option value="">Elige una materia prima…</option>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </Dropdown>
      </div>
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
