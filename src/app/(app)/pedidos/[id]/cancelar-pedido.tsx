"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

/** Cancelar exige motivo y libera las reservas (REQ-STK-7.2). */
export function CancelarPedido({ id, csrf }: { id: string; csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    setError(null);
    try {
      await pedir("POST", `/api/v1/pedidos/${id}/cancelar`, { csrf, idempotente: true, cuerpo: { motivo } });
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return <Boton variante="peligro" onClick={() => setAbierto(true)}><XCircle className="h-4 w-4" /> Cancelar pedido</Boton>;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); cancelar(); }}>
      <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo de la cancelación" aria-label="Motivo de la cancelación"
        className="h-9 w-64 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none" />
      <Boton type="submit" variante="peligro" disabled={!motivo.trim() || enviando}>{enviando ? "Cancelando…" : "Confirmar cancelación"}</Boton>
      <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Volver</Boton>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}
