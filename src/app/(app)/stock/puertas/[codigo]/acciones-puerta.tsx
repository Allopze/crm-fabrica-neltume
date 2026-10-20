"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

const campo = `w-full ${campoAlto}`;

function useEnvio() {
  const router = useRouter();
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<unknown>, ok: string, alTerminar?: () => void) => iniciar(async () => {
    try { await fn(); setError(null); setExito(ok); alTerminar?.(); router.refresh(); } catch (e) { setExito(null); setError(e); }
  });
  return { enviar, pendiente, exito, error };
}

const Mensaje = ({ exito, error }: { exito: string | null; error: unknown }) => (
  <>
    {exito && <p role="status" className="mt-3 text-sm text-musgo">{exito}</p>}
    {error ? <ErrorAccion error={error} className="mt-3" /> : null}
  </>
);

/** Ubicación, calidad y observación; la existencia no se edita (REQ-STK-8.4). */
export function EditarPuerta({ codigo, ubicacion, calidad, observacion, ubicaciones, csrf }: {
  codigo: string; ubicacion: string; calidad: string; observacion: string | null; ubicaciones: string[]; csrf: string;
}) {
  const { enviar, pendiente, exito, error } = useEnvio();
  return (
    <form aria-label="Datos de la puerta" className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const cuerpo = { ubicacion: String(f.get("ubicacion")), calidad: String(f.get("calidad")), observacion: String(f.get("observacion") ?? "").trim() || null };
      enviar(() => pedir("PATCH", `/api/v1/puertas/${encodeURIComponent(codigo)}`, { csrf, cuerpo }), "Datos guardados.");
    }}>
      <label className="block text-sm">Ubicación
        <input name="ubicacion" required defaultValue={ubicacion} list="ubicaciones-puerta" maxLength={60} className={`${campo} mt-1`} />
        <datalist id="ubicaciones-puerta">{ubicaciones.map((u) => <option key={u} value={u} />)}</datalist>
      </label>
      <label className="block text-sm">Calidad
        <select name="calidad" defaultValue={calidad} className={`${campo} mt-1`}><option value="primera">Primera</option><option value="segunda">De segunda</option></select>
      </label>
      <label className="block text-sm">Observación
        <input name="observacion" defaultValue={observacion ?? ""} maxLength={300} className={`${campo} mt-1`} placeholder="Manchada, pintada, sin film…" />
      </label>
      <Boton type="submit" disabled={pendiente} className="w-full">{pendiente ? "Guardando…" : "Guardar cambios"}</Boton>
      <Mensaje exito={exito} error={error} />
    </form>
  );
}

type Accion = "apartar" | "liberar" | "salida" | "baja" | "devolver";
const ACCION: Record<Accion, { boton: string; dato: string; ok: string; minimo: number }> = {
  apartar: { boton: "Apartar", dato: "Para quién (nombre del cliente)", ok: "Puerta apartada.", minimo: 2 },
  liberar: { boton: "Liberar", dato: "Motivo", ok: "Puerta liberada: vuelve a estar disponible.", minimo: 3 },
  salida: { boton: "Registrar salida", dato: "Documento (factura, boleta, guía…)", ok: "Salida registrada.", minimo: 1 },
  baja: { boton: "Dar de baja", dato: "Motivo (obligatorio)", ok: "Puerta dada de baja.", minimo: 3 },
  devolver: { boton: "Devolver al stock", dato: "Motivo (devolución, conteo…)", ok: "La puerta volvió al stock.", minimo: 3 },
};

/** Apartar, liberar, sacar o devolver una puerta (REQ-STK-8.3, 8.5). Cada acción es un movimiento que no se edita ni borra. */
export function AccionesPuerta({ codigo, existencia, apartada, puedeMover, puedeAjustar, csrf }: {
  codigo: string; existencia: number; apartada: number; puedeMover: boolean; puedeAjustar: boolean; csrf: string;
}) {
  const { enviar, pendiente, exito, error } = useEnvio();
  const [abierta, setAbierta] = useState<Accion | null>(null);
  const disponibles: Accion[] = [
    ...(puedeMover && existencia === 1 && apartada === 0 ? ["apartar" as const] : []),
    ...(puedeMover && apartada === 1 ? ["liberar" as const] : []),
    ...(puedeMover && existencia === 1 ? ["salida" as const] : []),
    ...(puedeAjustar && existencia === 1 ? ["baja" as const] : []),
    ...(puedeAjustar && existencia === 0 ? ["devolver" as const] : []),
  ];
  if (!disponibles.length) return <p className="text-sm text-tinta-tenue">No hay acciones disponibles para esta puerta con tus permisos.</p>;
  const ruta = (a: Accion) => (a === "apartar" || a === "liberar" ? `/api/v1/puertas/${encodeURIComponent(codigo)}/${a}` : a === "salida" ? "/api/v1/movimientos/salidas" : "/api/v1/movimientos/ajustes");
  const cuerpo = (a: Accion, dato: string) => ({
    apartar: { para: dato }, liberar: { motivo: dato }, salida: { puertas: [codigo], referencia: dato },
    baja: { puertas: [codigo], cantidad: -1, motivo: dato }, devolver: { puertas: [codigo], cantidad: 1, motivo: dato },
  })[a];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {disponibles.map((a) => <Boton key={a} variante={abierta === a ? "primario" : "secundario"} onClick={() => setAbierta(abierta === a ? null : a)}>{ACCION[a].boton}</Boton>)}
      </div>
      {abierta && (
        <form aria-label={ACCION[abierta].boton} className="mt-4 rounded-md border border-linea bg-papel p-3" onSubmit={(e) => {
          e.preventDefault();
          const dato = String(new FormData(e.currentTarget).get("dato") ?? "").trim();
          enviar(() => pedir("POST", ruta(abierta), { csrf, idempotente: true, cuerpo: cuerpo(abierta, dato) }), ACCION[abierta].ok, () => setAbierta(null));
        }}>
          <label className="block text-sm">{ACCION[abierta].dato}
            <input name="dato" required minLength={ACCION[abierta].minimo} maxLength={120} autoFocus className={`${campo} mt-1`} />
          </label>
          <p className="mt-2 text-xs text-tinta-tenue">Queda como movimiento de la puerta: no se puede editar ni borrar.</p>
          <Boton type="submit" variante="primario" disabled={pendiente} className="mt-3 w-full">{pendiente ? "Registrando…" : `Confirmar: ${ACCION[abierta].boton.toLowerCase()}`}</Boton>
        </form>
      )}
      <Mensaje exito={exito} error={error} />
    </div>
  );
}
