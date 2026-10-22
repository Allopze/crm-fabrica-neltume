"use client";

import { Check } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { Dropdown } from "@/components/ui/dropdown";
import { clp, cn } from "@/lib/formato";
import { Descuento } from "./descuento";
import type { CotizacionDetalle } from "./tipos";

const numeroPct = (f: number) => `${String(Math.round(f * 10_000) / 100).replace(".", ",")} %`;

/** Cliente, totales y descuento de la cotización. Sin ítems no hay montos que mostrar: «—», no «$0». */
export function Resumen({ c, clientes, aprobada, pendiente, puedeDescontar, onCliente, onDescuento }: {
  c: CotizacionDetalle; clientes: { id: string; nombre: string }[] | null; aprobada: boolean; pendiente: boolean; puedeDescontar: boolean;
  onCliente: (clienteId: string | null) => void; onDescuento: (porcentaje: number, motivo: string) => void;
}) {
  const vacia = c.items.length === 0;
  const monto = (v: unknown) => (vacia ? "—" : clp(Number(v)));
  return (
    <div className="rounded-lg border border-linea-fuerte bg-lamina">
      {aprobada ? (
        <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3 text-sm">
          <span className="text-tinta-suave">Cliente</span><span className="text-right font-medium">{c.cliente?.nombre ?? "—"}</span>
        </div>
      ) : clientes && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-linea px-5 py-3 text-sm">
          <span className="text-tinta-suave">Cliente</span>
          <Dropdown disabled={pendiente} value={c.clienteId ?? ""} aria-label="Cliente" className="max-w-xs"
            onChange={(clienteId) => onCliente(clienteId || null)}>
            <option value="">Elegir cliente…</option>
            {clientes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </Dropdown>
        </div>
      )}
      <dl className="divide-y divide-linea/70 text-sm">
        <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">Subtotal neto</dt><dd className="tabular-nums">{monto(c.subtotal)}</dd></div>
        {Number(c.descuento) > 0 && <div className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-tinta-suave">Descuento {numeroPct(Number(c.descuentoPct))} ({c.descuentoMotivo})</dt><dd className="tabular-nums">−{clp(Number(c.descuento))}</dd></div>}
        {puedeDescontar && !aprobada && !vacia && (
          <div className="px-5 py-2.5">
            <dt className="sr-only">Aplicar descuento</dt>
            <dd><Descuento key={`${c.descuentoPct}:${c.descuentoMotivo}`} pct={Number(c.descuentoPct)} motivo={c.descuentoMotivo} deshabilitado={pendiente} onAplicar={onDescuento} /></dd>
          </div>
        )}
        <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">IVA 19 %</dt><dd className="tabular-nums">{monto(c.iva)}</dd></div>
        <div className="flex items-baseline justify-between gap-3 px-5 py-4"><dt className="font-medium">Total</dt><dd className="font-display text-3xl font-medium tabular-nums tracking-tight">{monto(c.total)}</dd></div>
      </dl>
      <p className="border-t border-linea px-5 py-2 text-xs text-tinta-tenue">
        Valores puestos en fábrica, flete aparte. Precios calculados por el sistema (lista v{c.lista.usada ?? c.lista.vigente}){c.origen === "ia" ? "; la IA no fija importes" : ""}.
      </p>
    </div>
  );
}

/**
 * Aprobar y su confirmación en línea (UX §3). En la cotización manual va en la columna lateral fija; con texto del
 * cliente, en una barra fija al pie. Dice por qué no se puede aprobar todavía.
 */
export function Aprobacion({ c, clientes, pendiente, confirmando, lateral, onConfirmar, onCancelar, onAprobar }: {
  c: CotizacionDetalle; clientes: { id: string; nombre: string }[] | null; pendiente: boolean; confirmando: boolean; lateral: boolean;
  onConfirmar: () => void; onCancelar: () => void; onAprobar: () => void;
}) {
  const motivos = [c.pendientes > 0 ? "aprobar-pendientes" : null, c.pendientes === 0 && !c.clienteId ? "aprobar-cliente" : null]
    .filter((id): id is string => id !== null).join(" ") || undefined;

  if (confirmando) {
    return (
      <div role="group" aria-labelledby="confirmar-aprobacion" className={cn("rounded-lg border border-rauli/30 bg-rauli-velo/50 p-5", !lateral && "mt-5")}>
        <p id="confirmar-aprobacion" className="font-display text-lg font-medium">Aprobar la cotización N.º {c.numero}</p>
        <ul className="mt-2 space-y-1 text-sm text-tinta-suave">
          <li>{c.items.length === 1 ? "1 ítem" : `${c.items.length} ítems`} para <strong className="text-tinta">{clientes?.find((x) => x.id === c.clienteId)?.nombre ?? "el cliente elegido"}</strong> · total <strong className="text-tinta tabular-nums">{clp(Number(c.total))}</strong> IVA incluido.</li>
          <li>Los precios quedan congelados con la lista v{c.lista.usada ?? c.lista.vigente}, aunque la lista cambie después.</li>
          <li>Vigencia de {c.vigenciaDias} días hábiles desde hoy. Después ya no se puede editar: queda lista para el PDF y para convertirla en pedido.</li>
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Boton variante="fantasma" disabled={pendiente} onClick={onCancelar}>Volver a revisar</Boton>
          <Boton variante="primario" className="h-11 px-5" disabled={pendiente} autoFocus onClick={onAprobar}>
            <Check className="h-4 w-4" /> {pendiente ? "Aprobando…" : "Confirmar aprobación"}
          </Boton>
        </div>
      </div>
    );
  }

  const listo = c.pendientes === 0 && Boolean(c.clienteId) && c.items.length > 0;
  return (
    <div className={cn(lateral
      ? "flex flex-col gap-2"
      : "sticky bottom-0 z-10 -mx-1 mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-linea bg-papel/95 px-1 py-3 backdrop-blur")}>
      {c.pendientes > 0 && <p id="aprobar-pendientes" className="text-sm text-ambar">Resuelve {c.pendientes} {c.pendientes === 1 ? "ítem" : "ítems"} para poder aprobar.</p>}
      {c.pendientes === 0 && !c.clienteId && (
        <p id="aprobar-cliente" className="text-sm text-ambar">
          {clientes ? "Elige el cliente para poder aprobar." : "Falta asignar el cliente. Pídelo a alguien con permiso para ver clientes."}
        </p>
      )}
      <Boton variante="primario" className={cn("h-11 px-5", lateral && "order-first w-full", listo && "ring-4 ring-rauli/15")}
        disabled={pendiente || !listo} aria-describedby={motivos} onClick={onConfirmar}>
        <Check className="h-4 w-4" /> Aprobar cotización
      </Boton>
    </div>
  );
}
