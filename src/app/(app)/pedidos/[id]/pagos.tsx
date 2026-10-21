"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Wallet } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campo as campoBase } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { MEDIOS } from "@/components/ui/estado-pedido";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp, cn, fecha } from "@/lib/formato";

const campo = `mt-1 w-full ${campoBase}`;

export interface PagoFila {
  id: string; monto: number; fecha: string; medio: string; referencia: string | null; revierteId: string | null; motivo: string | null;
  registradoPor: string; revertido: boolean;
}
export interface Resumen { total: number; pagado: number; saldo: number; abonoPct: number; abonoRequerido: number; faltaAbono: number; estado: string }

/**
 * Pagos de la nota (REQ-COT-8.10–8.12, ADR-0020): resumen, pagos con su reverso y «Registrar pago» con el monto
 * sugerido (el abono que falta o el saldo). Los pagos no se editan: un error se revierte con motivo.
 */
export function Pagos({ id, csrf, resumen, pagos, puedeRegistrar, cancelada, hoy }: {
  id: string; csrf: string; resumen: Resumen; pagos: PagoFila[]; puedeRegistrar: boolean; cancelada: boolean; hoy: string;
}) {
  const router = useRouter();
  const sugerido = resumen.faltaAbono > 0 ? resumen.faltaAbono : resumen.saldo;
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(String(sugerido));
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const valor = Number(monto.replace(/\D/g, ""));

  const enviar = (url: string, cuerpo: object, ok: string, despues: () => void) => iniciar(async () => {
    try {
      await pedir("POST", url, { csrf, idempotente: true, cuerpo });
      setError(null);
      setMensaje(ok);
      despues();
      router.refresh();
    } catch (e) {
      setMensaje(null);
      setError(e);
    }
  });

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div><dt className="text-tinta-tenue">Total</dt><dd className="mt-0.5 tabular-nums">{clp(resumen.total)}</dd></div>
        <div><dt className="text-tinta-tenue">Abono ({resumen.abonoPct} %)</dt><dd className="mt-0.5 tabular-nums">{clp(resumen.abonoRequerido)}</dd></div>
        <div><dt className="text-tinta-tenue">Pagado</dt><dd className="mt-0.5 tabular-nums">{clp(resumen.pagado)}</dd></div>
        <div><dt className="text-tinta-tenue">Saldo</dt><dd className={cn("mt-0.5 font-display text-xl tabular-nums", resumen.saldo > 0 && resumen.estado !== "sin_control" && "text-ambar")}>{clp(resumen.saldo)}</dd></div>
      </dl>
      {resumen.estado === "sin_control" && <p className="text-tinta-tenue">Esta nota no exige abono ni pago total (tienda o nota anterior al control de pagos). Los pagos que lleguen se registran igual.</p>}

      {pagos.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea" aria-label="Pagos registrados">
          {pagos.map((p) => (
            <li key={p.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn(p.revertido && "text-tinta-tenue line-through")}>
                  {fecha(p.fecha)} · {MEDIOS[p.medio] ?? p.medio}{p.referencia && <> · N.º {p.referencia}</>}
                </span>
                <span className={cn("tabular-nums", p.monto < 0 ? "text-error" : p.revertido ? "text-tinta-tenue line-through" : "font-medium")}>{p.monto < 0 ? `−${clp(-p.monto)}` : clp(p.monto)}</span>
              </div>
              <p className="mt-0.5 text-xs text-tinta-tenue">
                {p.revierteId ? <>Reverso: {p.motivo} · </> : null}{p.registradoPor}
                {puedeRegistrar && !p.revierteId && !p.revertido && revirtiendo !== p.id && (
                  <button type="button" onClick={() => { setRevirtiendo(p.id); setMotivo(""); setError(null); setMensaje(null); }} className="-my-2 ml-2 inline-flex min-h-9 items-center gap-1 py-2 text-rauli hover:underline pointer-coarse:min-h-11">
                    <Undo2 className="h-3 w-3" /> Revertir
                  </button>
                )}
              </p>
              {revirtiendo === p.id && (() => {
                const nuevoPagado = resumen.pagado - p.monto;
                const nuevoSaldo = Math.max(resumen.total - nuevoPagado, 0);
                const vuelveSinAbono = resumen.estado !== "sin_control" && nuevoPagado < resumen.abonoRequerido;
                return (
                  <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); enviar(`/api/v1/pedidos/${id}/pagos/${p.id}/reverso`, { motivo }, "Pago revertido.", () => setRevirtiendo(null)); }}>
                    <p className="basis-full text-xs text-tinta-suave">
                      Al revertir, el saldo vuelve a <strong className="text-tinta">{clp(nuevoSaldo)}</strong>.
                      {vuelveSinAbono && " La nota vuelve a quedar sin abono: no se podrá producir hasta pagar o registrar una excepción."}
                      {!vuelveSinAbono && nuevoSaldo > 0 && " La nota queda con saldo pendiente: no se podrá despachar hasta pagarlo o registrar una excepción."}
                    </p>
                    <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo del reverso" aria-label="Motivo del reverso"
                      className="h-9 min-w-0 flex-1 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none pointer-coarse:h-11" />
                    <Boton type="submit" variante="peligro" disabled={!motivo.trim() || pendiente}>{pendiente ? "Revirtiendo…" : "Confirmar reverso"}</Boton>
                    <Boton type="button" variante="fantasma" onClick={() => setRevirtiendo(null)}>Volver</Boton>
                  </form>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      {puedeRegistrar && !cancelada && resumen.saldo > 0 && (abierto ? (
        <form aria-label="Registrar pago" className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          enviar(`/api/v1/pedidos/${id}/pagos`, { monto: valor, fecha: String(f.get("fecha")), medio: String(f.get("medio")), referencia: String(f.get("referencia") ?? "").trim() || null },
            "Pago registrado.", () => setAbierto(false));
        }}>
          <label className="block text-tinta-tenue">Monto (CLP)
            <input name="monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} className={cn(campo, "tabular-nums")} />
          </label>
          <p className="-mt-1 flex flex-wrap gap-2 text-xs">
            {resumen.faltaAbono > 0 && <button type="button" onClick={() => setMonto(String(resumen.faltaAbono))} className="inline-flex min-h-9 items-center rounded-full border border-linea px-2.5 py-1 hover:border-tinta pointer-coarse:min-h-11">Abono {clp(resumen.faltaAbono)}</button>}
            <button type="button" onClick={() => setMonto(String(resumen.saldo))} className="inline-flex min-h-9 items-center rounded-full border border-linea px-2.5 py-1 hover:border-tinta pointer-coarse:min-h-11">Saldo completo {clp(resumen.saldo)}</button>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-tinta-tenue">Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required className={campo} /></label>
            <div className="block text-tinta-tenue">Medio de pago
              <Dropdown name="medio" defaultValue="transferencia" aria-label="Medio de pago">
                {Object.entries(MEDIOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Dropdown>
            </div>
          </div>
          <label className="block text-tinta-tenue">N.º de comprobante (opcional)
            <input name="referencia" maxLength={60} placeholder="Transferencia o boleta; nunca el número de tarjeta" className={campo} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" variante="primario" disabled={pendiente || !(valor > 0) || valor > resumen.saldo}>{pendiente ? "Registrando…" : `Registrar ${valor > 0 ? clp(valor) : "pago"}`}</Boton>
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Volver</Boton>
          </div>
          {valor > resumen.saldo && <p className="text-xs text-error">Supera el saldo de {clp(resumen.saldo)}.</p>}
        </form>
      ) : (
        <Boton variante={resumen.estado === "sin_abono" ? "primario" : "secundario"} onClick={() => { setMonto(String(sugerido)); setAbierto(true); setError(null); setMensaje(null); }}>
          <Wallet className="h-4 w-4" /> Registrar pago
        </Boton>
      ))}
      {mensaje && <p role="status" className="text-musgo">{mensaje}</p>}
      {error ? <ErrorAccion error={error} /> : null}
    </div>
  );
}
