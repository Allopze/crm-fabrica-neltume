"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp } from "@/lib/formato";

/** Cancelar exige motivo y libera las reservas (REQ-STK-7.2). Antes de confirmar se dice qué se pierde. */
export function CancelarPedido({ id, csrf, reservas, pagado }: { id: string; csrf: string; reservas: number; pagado: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    setError(null);
    try {
      await pedir("POST", `/api/v1/pedidos/${id}/cancelar`, { csrf, idempotente: true, cuerpo: { motivo } });
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return <Boton variante="peligro" onClick={() => setAbierto(true)}><XCircle className="h-4 w-4" /> Cancelar pedido</Boton>;
  return (
    <form aria-label="Cancelar pedido" className="w-full rounded-md border border-error/25 bg-error-velo/40 p-3"
      onSubmit={(e) => { e.preventDefault(); void cancelar(); }}>
      <p className="text-sm text-tinta">
        Se liberarán <strong>{reservas} {reservas === 1 ? "reserva" : "reservas"}</strong>. La nota no se puede reabrir.
      </p>
      {pagado > 0 && (
        <p className="mt-1 text-sm text-error">
          Hay {clp(pagado)} registrado: el sistema no devuelve el dinero automáticamente. Anótalo antes de cancelar.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo de la cancelación" aria-label="Motivo de la cancelación"
          className="h-9 w-64 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none pointer-coarse:h-11" />
        <Boton type="submit" variante="peligro" disabled={!motivo.trim() || enviando}>{enviando ? "Cancelando…" : "Confirmar cancelación"}</Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Volver</Boton>
      </div>
      {error ? <ErrorAccion error={error} className="mt-2" /> : null}
    </form>
  );
}
