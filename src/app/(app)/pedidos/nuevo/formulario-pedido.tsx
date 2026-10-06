"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { Boton, Panel } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

const campo = "mt-1.5 h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

export function FormularioPedido({ cotizacionId, csrf, cliente, direccion, total }: { cotizacionId: string; csrf: string; cliente: string | null; direccion: string; total: string }) {
  const router = useRouter();
  const [despacho, setDespacho] = useState(direccion);
  const [transporte, setTransporte] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const p = await pedir<{ id: string }>("POST", "/api/v1/pedidos", { csrf, idempotente: true, cuerpo: { cotizacionId, direccionDespacho: despacho || null, medioTransporte: transporte || null } });
      router.push(`/pedidos/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <Panel titulo="Despacho">
      {cliente && <p className="mb-4 text-sm">Para <strong>{cliente}</strong></p>}
      <label className="block text-sm font-medium">Dirección de despacho
        <input value={despacho} onChange={(e) => setDespacho(e.target.value)} maxLength={300} placeholder="Vacío = retira en fábrica" className={campo} />
      </label>
      <label className="mt-4 block text-sm font-medium">Medio de transporte
        <input value={transporte} onChange={(e) => setTransporte(e.target.value)} maxLength={120} placeholder="p. ej. camión propio, Starken" className={campo} />
      </label>
      <p className="mt-5 flex items-baseline justify-between text-sm"><span className="text-tinta-suave">Total congelado</span><span className="font-display text-2xl tabular-nums">{total}</span></p>
      {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
      <Boton variante="primario" className="mt-5 h-11 w-full" disabled={enviando} onClick={confirmar}>
        <Truck className="h-4 w-4" /> {enviando ? "Creando nota…" : "Confirmar pedido y reservar"}
      </Boton>
    </Panel>
  );
}
