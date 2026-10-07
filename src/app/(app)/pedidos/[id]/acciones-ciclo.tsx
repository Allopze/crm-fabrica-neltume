"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Factory, PackageCheck, Truck } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";
import { ElegirPuertas, eleccionInicial, type GrupoDespacho } from "./elegir-puertas";

/** Avance del pedido (REQ-COT-8.5): producción → completar reserva → lista → despacho. El backend valida cada paso. */
export function AccionesCiclo({ id, estado, faltanteCatalogo, itemsAPedido, puedeProducir, grupos = [], csrf }: {
  id: string; estado: string; faltanteCatalogo: number; itemsAPedido: number; puedeProducir: boolean; grupos?: GrupoDespacho[]; csrf: string;
}) {
  const router = useRouter();
  const [confirmo, setConfirmo] = useState(false);
  const [despachando, setDespachando] = useState(false);
  // Se calcula al abrir el despacho: antes de «lista» todavía no hay puertas para elegir.
  const [eleccion, setEleccion] = useState<Record<string, string[]>>({});
  const completa = grupos.every((g) => (eleccion[g.articulo] ?? []).length === g.cantidad);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const hacer = (ruta: string, ok: string, cuerpo?: object) => iniciar(async () => {
    try {
      await pedir("POST", `/api/v1/pedidos/${id}/${ruta}`, { csrf, idempotente: true, cuerpo: cuerpo ?? {} });
      setMsg({ ok: true, texto: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {estado === "pendiente" && puedeProducir && (
          <Boton variante={faltanteCatalogo > 0 ? "primario" : "secundario"} disabled={pendiente} onClick={() => hacer("produccion", "Pedido en producción.")}>
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
          <Boton variante="primario" disabled={pendiente} onClick={() => { setEleccion(eleccionInicial(grupos)); setDespachando(true); }}>
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
      {faltanteCatalogo > 0 && estado !== "lista" && <p className="text-xs text-tinta-tenue">Para marcarla lista, todo lo de catálogo debe estar reservado.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-musgo" : "text-sm text-error"}>{msg.texto}</p>}
    </div>
  );
}
