"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Plus, TriangleAlert } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto as campo } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { numero } from "@/lib/formato";

function useEnvio() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<unknown>, alTerminar?: () => void, refrescar = true) => iniciar(async () => {
    try { setError(null); await fn(); alTerminar?.(); if (refrescar) router.refresh(); } catch (e) { setError(e); }
  });
  return { enviar, pendiente, error };
}

export function NuevaOrden({ csrf }: { csrf: string }) {
  const router = useRouter();
  const { enviar, pendiente, error } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <Boton variante="primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nueva orden</Boton>;
  return (
    <form aria-label="Nueva orden" className="flex flex-wrap items-end gap-2 rounded-lg border border-linea-fuerte bg-lamina p-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      enviar(async () => {
        const o = await pedir<{ id: string }>("POST", "/api/v1/ordenes", { csrf, idempotente: true, cuerpo: { lineas: [{ codigo: String(f.get("codigo")), cantidad: Number(f.get("cantidad")) }] } });
        router.push(`/produccion?orden=${o.id}`);
      }, () => setAbierto(false), false);
    }}>
      <label className="text-sm">Artículo<input name="codigo" required placeholder="NEL-R-4-B" className={`${campo} mt-1 block w-40 font-mono uppercase`} /></label>
      <label className="text-sm">Cantidad<input name="cantidad" required inputMode="numeric" className={`${campo} mt-1 block w-24`} /></label>
      <Boton type="submit" variante="primario" disabled={pendiente} className="h-10">{pendiente ? "Creando…" : "Crear orden"}</Boton>
      <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)} className="h-10">Cancelar</Boton>
      {error ? <ErrorAccion error={error} className="basis-full px-3 py-2" /> : null}
    </form>
  );
}

/** Anular una orden abierta no mueve stock; la orden queda en el historial como anulada. */
export function AnularOrden({ id, numero: num, csrf }: { id: string; numero: number; csrf: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  // El foco entra a la confirmación y vuelve al disparador al cerrarla (UX §2).
  const disparador = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (confirmando) confirmarRef.current?.focus();
    else if (devolverFoco.current) {
      devolverFoco.current = false;
      disparador.current?.focus();
    }
  }, [confirmando]);

  const cerrar = () => {
    devolverFoco.current = true;
    setConfirmando(false);
  };

  const anular = () => iniciar(async () => {
    try {
      setError(null);
      await pedir("POST", `/api/v1/ordenes/${id}/anular`, { csrf, idempotente: true, cuerpo: {} });
      cerrar();
      router.refresh();
    } catch (e) {
      setError(e);
    }
  });

  if (!confirmando) {
    return (
      <button ref={disparador} type="button" onClick={() => setConfirmando(true)}
        className="inline-flex min-h-9 items-center text-xs font-medium text-error hover:underline pointer-coarse:min-h-11">
        Anular
      </button>
    );
  }
  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-1 text-xs">
      <span>¿Anular N.º {num}?</span>
      <button ref={confirmarRef} type="button" disabled={pendiente} onClick={anular}
        className="inline-flex min-h-9 items-center rounded px-1.5 font-medium text-error hover:bg-error-velo disabled:opacity-60 pointer-coarse:min-h-11">
        {pendiente ? "Anulando…" : "Sí"}
      </button>
      <button type="button" disabled={pendiente} onClick={cerrar}
        className="inline-flex min-h-9 items-center rounded px-1.5 text-tinta-suave hover:bg-papel-hundido disabled:opacity-60 pointer-coarse:min-h-11">
        No
      </button>
      {error ? <ErrorAccion error={error} className="basis-full px-2 py-1 text-xs" /> : null}
    </div>
  );
}

interface Insumo { materiaPrimaId: string; nombre: string; unidad: string; usa: number; existencia: number; faltante: number }

/** Vista previa y cierre de una orden (UX §4): muestra consumos y faltantes antes de confirmar. */
export function CierreOrden({ ordenId, numero: num, insumos, sinBom, incompletos, demo, materias, csrf }: {
  ordenId: string; numero: number; insumos: Insumo[]; sinBom: string[]; incompletos: string[]; demo: boolean; materias: { id: string; nombre: string; unidad: string }[]; csrf: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const [manual, setManual] = useState<{ materiaPrimaId: string; cantidad: string }>({ materiaPrimaId: materias[0]?.id ?? "", cantidad: "" });
  const [ubicacion, setUbicacion] = useState("Fábrica");
  const cuerpo = {
    ...(sinBom.length && manual.cantidad ? { consumosManuales: [{ materiaPrimaId: manual.materiaPrimaId, cantidad: Number(manual.cantidad.replace(",", ".")) }] } : {}),
    ...(ubicacion.trim() ? { ubicacion: ubicacion.trim() } : {}),
  };
  // El motivo de un botón deshabilitado se dice al lado, no se adivina.
  const primeraFaltante = insumos.find((i) => i.faltante > 0);
  const bloqueo = incompletos.length ? <>falta asociar la madera. <Link href="/produccion?vista=madera" className="font-medium underline">Asociar madera</Link></>
    : primeraFaltante ? <>faltan materias primas. <Link href={`/materias-primas?recibir=${primeraFaltante.materiaPrimaId}#recepcion`} className="font-medium underline">Registrar recepción de {primeraFaltante.nombre}</Link></>
      : sinBom.length > 0 && !manual.cantidad ? <>indica el consumo a mano de los artículos sin BOM.</> : null;
  const cerrar = () => iniciar(async () => {
    try {
      setError(null);
      await pedir("POST", `/api/v1/ordenes/${ordenId}/cerrar`, { csrf, idempotente: true, cuerpo });
      // Tras cerrar no se elige otra orden sola: el resultado queda a la vista y un segundo clic no cierra otra.
      router.push(`/produccion?cerrada=${num}`);
      router.refresh();
    } catch (e) { setError(e); setConfirmando(false); }
  });

  return (
    <div>
      {incompletos.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-error/30 bg-error-velo p-3 text-sm text-error">
          <p className="font-medium">No se puede calcular el consumo de la receta:</p>
          <ul className="mt-1 list-disc pl-5">{incompletos.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-1">Asocia cada madera a su materia prima en <Link href="/produccion?vista=madera" className="font-medium underline">Madera de la puerta</Link>.</p>
        </div>
      )}
      {sinBom.length > 0 && (
        <div className="mb-4 rounded-md border border-ambar/30 bg-ambar-velo p-3 text-sm text-ambar">
          <p className="font-medium">Sin BOM: {sinBom.join(", ")}. Registra el consumo a mano:</p>
          <div className="mt-2 flex gap-2">
            <Dropdown aria-label="Materia prima consumida" value={manual.materiaPrimaId} onChange={(materiaPrimaId) => setManual({ ...manual, materiaPrimaId })} className="min-w-0 flex-1">
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
            </Dropdown>
            <input aria-label="Cantidad consumida" inputMode="decimal" value={manual.cantidad} onChange={(e) => setManual({ ...manual, cantidad: e.target.value })} className={`${campo} h-9 w-24`} />
          </div>
        </div>
      )}
      {insumos.length > 0 && (
        <ul className="divide-y divide-linea/70 rounded-md border border-linea">
          {insumos.map((i) => (
            <li key={i.materiaPrimaId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{i.nombre}</span>
              <span className="shrink-0 whitespace-nowrap font-mono tabular-nums">
                <span className={i.faltante > 0 ? "text-error" : "text-tinta"}>−{numero(i.usa)}</span> <span className="text-tinta-tenue">{i.unidad} · hay {numero(i.existencia)}</span>
                {i.faltante > 0 && <span className="ml-2 inline-flex items-center gap-1 text-error"><TriangleAlert className="h-3.5 w-3.5" /> faltan {numero(i.faltante)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Cerrar mueve stock y no se puede deshacer: primero se nombra lo que va a pasar, después se confirma (UX §4). */}
      {bloqueo ? (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-md border border-ambar/30 bg-ambar-velo px-3 py-2.5 text-sm text-ambar"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>No se puede cerrar todavía: {bloqueo}</span></p>
      ) : !confirmando ? (
        <Boton variante="primario" className="mt-5 h-10 w-full" onClick={() => setConfirmando(true)}>
          <CheckCheck className="h-4 w-4" /> Cerrar orden N.º {num} y mover stock
        </Boton>
      ) : (
        <div role="group" aria-label={`Confirmar cierre de la orden N.º ${num}`} className="mt-5 rounded-md border border-tinta/20 bg-papel p-3">
          <p className="text-sm">Se {insumos.length === 1 ? "descontará 1 insumo" : `descontarán ${insumos.length} insumos`} y entrarán las puertas al stock, cada una con su código. Los movimientos no se pueden editar ni borrar; una corrección es un ajuste con motivo.</p>
          <label className="mt-3 block text-sm">Las puertas quedan en
            <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} maxLength={60} className={`${campo} mt-1 block w-full`} />
          </label>
          <div className="mt-3 flex gap-2">
            <Boton variante="primario" className="h-10 flex-1" disabled={pendiente} onClick={cerrar} autoFocus>
              <CheckCheck className="h-4 w-4" /> {pendiente ? "Cerrando orden…" : "Confirmar cierre"}
            </Boton>
            <Boton variante="fantasma" className="h-10" disabled={pendiente} onClick={() => setConfirmando(false)}>Volver</Boton>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-tinta-tenue">Todo o nada: si falta un insumo, no se mueve nada.{demo && " Usa un BOM de DEMOSTRACIÓN."}</p>
      {error ? <ErrorAccion error={error} className="mt-2" /> : null}
    </div>
  );
}
