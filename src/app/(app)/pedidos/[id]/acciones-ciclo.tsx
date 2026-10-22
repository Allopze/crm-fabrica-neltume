"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Factory, PackageCheck, Truck } from "lucide-react";
import { Boton, Hecho } from "@/components/ui/base";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp } from "@/lib/formato";
import { ElegirPuertas, eleccionInicial, type GrupoDespacho } from "./elegir-puertas";

/**
 * Avance del pedido (REQ-COT-8.5): producción → completar reserva → lista → despacho. El backend valida cada paso.
 * Sin abono no se produce y con saldo no se despacha; la excepción pide motivo y queda auditada (REQ-COT-8.13).
 */
export function AccionesCiclo({ id, estado, faltanteCatalogo, itemsAPedido, puedeProducir, grupos = [], csrf, bloqueo, puedeExcepcion }: {
  id: string; estado: string; faltanteCatalogo: number; itemsAPedido: number; puedeProducir: boolean; grupos?: GrupoDespacho[]; csrf: string;
  /** Lo que falta pagar para producir (abono) o para despachar (saldo); nulo si no bloquea. */
  bloqueo: { abono: number | null; saldo: number | null }; puedeExcepcion: boolean;
}) {
  const router = useRouter();
  const [confirmo, setConfirmo] = useState(false);
  const [despachando, setDespachando] = useState(false);
  // Se calcula al abrir el despacho: antes de «lista» todavía no hay puertas para elegir.
  const [eleccion, setEleccion] = useState<Record<string, string[]>>({});
  const completa = grupos.every((g) => (eleccion[g.articulo] ?? []).length === g.cantidad);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [excepcion, setExcepcion] = useState<"abono" | "saldo" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendiente, iniciar] = useTransition();
  const hacer = (ruta: string, ok: string, cuerpo?: object) => iniciar(async () => {
    try {
      await pedir("POST", `/api/v1/pedidos/${id}/${ruta}`, { csrf, idempotente: true, cuerpo: cuerpo ?? {} });
      setError(null);
      setMensaje(ok);
      router.refresh();
    } catch (e) {
      setMensaje(null);
      setError(e);
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {estado === "pendiente" && puedeProducir && (
          <Boton variante={faltanteCatalogo > 0 ? "primario" : "secundario"} disabled={pendiente || bloqueo.abono !== null} onClick={() => hacer("produccion", "Pedido en producción.")}>
            <Factory className="h-4 w-4" /> {pendiente ? "Guardando…" : faltanteCatalogo > 0 ? `Producir faltante (${faltanteCatalogo})` : "Pasar a producción"}
          </Boton>
        )}
        {(estado === "pendiente" || estado === "en_produccion") && faltanteCatalogo > 0 && (
          <Boton disabled={pendiente} onClick={() => hacer("completar-reserva", "Reserva actualizada con el stock disponible.")}>
            <PackageCheck className="h-4 w-4" /> Completar reserva
          </Boton>
        )}
        {(estado === "pendiente" || estado === "en_produccion") && (
          <Boton variante={faltanteCatalogo === 0 ? "primario" : "secundario"} disabled={pendiente || faltanteCatalogo > 0 || (itemsAPedido > 0 && !confirmo)}
            onClick={() => hacer("lista", "Pedido listo para despacho.", { confirmarAPedido: confirmo })}>
            <CheckCheck className="h-4 w-4" /> Marcar lista
          </Boton>
        )}
        {estado === "lista" && !despachando && (
          <Boton variante="primario" disabled={pendiente || bloqueo.saldo !== null} onClick={() => { setEleccion(eleccionInicial(grupos)); setDespachando(true); }}>
            <Truck className="h-4 w-4" /> Registrar despacho
          </Boton>
        )}
      </div>
      {estado === "lista" && despachando && (
        <div role="group" aria-labelledby="confirmar-despacho" className="rounded-md border border-rauli/30 bg-rauli-velo/50 p-4 text-sm">
          <p id="confirmar-despacho" className="font-medium">Se descontará del stock todo lo reservado para este pedido.</p>
          <p className="mt-1 text-tinta-suave">Marca las puertas que se cargan (vienen marcadas las más antiguas). Los movimientos de despacho no se pueden editar ni borrar; una corrección posterior es un ajuste con motivo.</p>
          {grupos.length > 0 && <ElegirPuertas grupos={grupos} eleccion={eleccion} cambiar={setEleccion} />}
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton variante="primario" disabled={pendiente || !completa} autoFocus
              onClick={() => hacer("despachar", "Despacho registrado: stock descontado.", { puertas: Object.values(eleccion).flat() })}>
              <Truck className="h-4 w-4" /> {pendiente ? "Registrando…" : "Confirmar despacho"}
            </Boton>
            <Boton variante="fantasma" disabled={pendiente} onClick={() => setDespachando(false)}>Cancelar</Boton>
          </div>
        </div>
      )}
      {(estado === "pendiente" || estado === "en_produccion") && itemsAPedido > 0 && (
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className="accent-[var(--rauli)]" />
          Confirmo que {itemsAPedido === 1 ? "el ítem a pedido está fabricado" : `los ${itemsAPedido} ítems a pedido están fabricados`}
        </label>
      )}
      {estado === "pendiente" && puedeProducir && bloqueo.abono !== null && (
        <Bloqueo texto={`Falta el abono: ${clp(bloqueo.abono)} para producir.`} accion={puedeExcepcion && excepcion !== "abono" ? "Producir igual (excepción)" : null}
          abrir={() => { setExcepcion("abono"); setMotivo(""); }} />
      )}
      {estado === "lista" && bloqueo.saldo !== null && (
        <Bloqueo texto={`Falta pagar el saldo: ${clp(bloqueo.saldo)} para despachar.`} accion={puedeExcepcion && excepcion !== "saldo" ? "Despachar con saldo (excepción)" : null}
          abrir={() => { setExcepcion("saldo"); setMotivo(""); }} />
      )}
      {excepcion && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            try {
              await pedir("POST", `/api/v1/pedidos/${id}/excepcion-pago`, { csrf, idempotente: true, cuerpo: { tipo: excepcion, motivo } });
              setError(null);
              setMensaje(excepcion === "abono" ? "Excepción registrada: ya se puede producir." : "Excepción registrada: ya se puede despachar.");
              setExcepcion(null);
              router.refresh();
            } catch (err) {
              setMensaje(null);
              setError(err);
            }
          });
        }}>
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} aria-label="Motivo de la excepción"
            placeholder={excepcion === "abono" ? "Por qué se produce sin abono" : "Por qué se despacha con saldo"}
            className="h-9 min-w-0 flex-1 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none sm:max-w-sm pointer-coarse:h-11" />
          <Boton type="submit" disabled={!motivo.trim() || pendiente}>{pendiente ? "Guardando…" : "Registrar excepción"}</Boton>
          <Boton type="button" variante="fantasma" onClick={() => setExcepcion(null)}>Volver</Boton>
        </form>
      )}
      {estado === "en_produccion" && faltanteCatalogo === 0 && (
        <p role="status" className="text-sm text-musgo">Todo lo de catálogo está reservado: ya se puede marcar lista.</p>
      )}
      {faltanteCatalogo > 0 && estado !== "lista" && <p className="text-xs text-tinta-tenue">Para marcarla lista, todo lo de catálogo debe estar reservado.</p>}
      {mensaje && <Hecho>{mensaje}</Hecho>}
      {error ? <ErrorAccion error={error} /> : null}
    </div>
  );
}

function Bloqueo({ texto, accion, abrir }: { texto: string; accion: string | null; abrir: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ambar">
      <span>{texto} Regístralo en «Pagos».</span>
      {accion && <button type="button" onClick={abrir} className="-my-2 inline-flex min-h-9 items-center py-2 text-rauli hover:underline pointer-coarse:min-h-11">{accion}</button>}
    </p>
  );
}
