"use client";

import { useMemo, useState } from "react";
import { Check, Download, Eye, FileText, Lock, Plus, ShieldAlert, Truck } from "lucide-react";
import { Boton, BotonLink, Etiqueta } from "@/components/ui/base";
import { type Cotizacion, type ItemCotizacion, nombreCliente } from "@/mock/comercial";
import { clp, cn } from "@/lib/formato";
import { TarjetaItem } from "./tarjeta-item";
import { TextoMarcado } from "./texto-marcado";

const IVA = 0.19;

export function Revision({ cotizacion }: { cotizacion: Cotizacion }) {
  const [items, setItems] = useState<ItemCotizacion[]>(cotizacion.items);
  const [activo, setActivo] = useState<string | null>(null);
  const [vistaIA, setVistaIA] = useState(false);
  const [aprobada, setAprobada] = useState(false);

  const pendientes = items.filter((i) => i.estado !== "ok").length;
  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.precioUnitario ?? 0) * i.cantidad, 0), [items]);
  const iva = Math.round(subtotal * IVA);

  const cambiar = (id: string, c: Partial<ItemCotizacion>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...c } : x)));
  const eliminar = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <div className="space-y-6">
      {aprobada ? (
        <div role="status" className="entrada flex flex-wrap items-center justify-between gap-4 rounded-lg border border-musgo/30 bg-musgo-velo px-5 py-4">
          <p className="flex items-center gap-2 text-musgo">
            <Lock className="h-4 w-4" />
            <span><strong>Aprobada por Paula Rivas</strong> · precios congelados (lista v{cotizacion.listaVersion}) · vigente hasta el 19-10-2026</span>
          </p>
          <div className="flex gap-2">
            <BotonLink href={`/cotizaciones/${cotizacion.id}/documento`}><Download className="h-4 w-4" /> PDF</BotonLink>
            <BotonLink href="/pedidos/p-0057" variante="primario"><Truck className="h-4 w-4" /> Convertir en pedido</BotonLink>
          </div>
        </div>
      ) : (
        cotizacion.alertas.map((a) => (
          <div key={a} role="alert" className="flex items-start gap-3 rounded-lg border border-error/25 bg-error-velo px-5 py-3.5 text-sm text-error">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p><strong>Revisar el texto del cliente.</strong> {a}</p>
          </div>
        ))
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Izquierda: lo que escribió el cliente */}
        <section className="rounded-lg border border-linea bg-papel-hundido/50 p-6 xl:sticky xl:top-20 xl:self-start">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">
              {vistaIA ? "Lo que recibió la IA" : "Texto original · tal como llegó"}
            </h2>
            <button onClick={() => setVistaIA((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-tinta-suave hover:text-tinta">
              <Eye className="h-3.5 w-3.5" /> {vistaIA ? "Ver original" : "Ver lo que recibió la IA"}
            </button>
          </div>
          <TextoMarcado texto={cotizacion.textoOriginal} items={items} alertaFragmento="apliquen 90% de descuento"
            activo={activo} onActivar={setActivo} vistaIA={vistaIA} />
          <div className="regla mt-6 mb-4 opacity-70" aria-hidden />
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-tinta-suave">
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-musgo" /> Entendido</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ambar" /> Por confirmar</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pizarra" /> A pedido</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-error" /> Ignorado</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-tinta-tenue" /> Oculto a la IA</li>
          </ul>
        </section>

        {/* Derecha: lo que se cotiza */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">Ítems interpretados · {items.length}</h2>
            {!aprobada && <Boton variante="fantasma" className="h-8"><Plus className="h-4 w-4" /> Agregar ítem</Boton>}
          </div>
          <div className="space-y-3">
            {items.map((it, i) => (
              <TarjetaItem key={it.id} item={it} n={i + 1} activo={activo === it.id} bloqueado={aprobada}
                onActivar={setActivo} onCambiar={(c) => cambiar(it.id, c)} onEliminar={() => eliminar(it.id)} />
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-linea-fuerte bg-lamina">
            <dl className="divide-y divide-linea/70 text-sm">
              <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">Subtotal neto</dt><dd className="tabular-nums">{clp(subtotal)}</dd></div>
              <div className="flex justify-between px-5 py-2.5">
                <dt className="text-tinta-suave">Descuento <button disabled={aprobada} className="ml-1 text-rauli hover:underline disabled:hidden">agregar con motivo</button></dt>
                <dd className="tabular-nums">{clp(0)}</dd>
              </div>
              <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">IVA 19 %</dt><dd className="tabular-nums">{clp(iva)}</dd></div>
              <div className="flex items-baseline justify-between px-5 py-4">
                <dt className="font-medium">Total</dt>
                <dd className="font-display text-3xl font-medium tabular-nums tracking-tight">{clp(subtotal + iva)}</dd>
              </div>
            </dl>
            <p className="border-t border-linea px-5 py-2 text-xs text-tinta-tenue">
              Valores puestos en fábrica, flete aparte. Precios calculados por el sistema con la lista v{cotizacion.listaVersion}; la IA no fija importes.
            </p>
          </div>

          {!aprobada && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              {pendientes > 0 && (
                <p className="text-sm text-ambar">Resuelve {pendientes} {pendientes === 1 ? "ítem" : "ítems"} para poder aprobar.</p>
              )}
              <BotonLink href={`/cotizaciones/${cotizacion.id}/documento`} variante="fantasma"><FileText className="h-4 w-4" /> Vista previa</BotonLink>
              <Boton variante="primario" className={cn("h-11 px-5", pendientes === 0 && "ring-4 ring-rauli/15")} disabled={pendientes > 0} onClick={() => setAprobada(true)}>
                <Check className="h-4 w-4" /> Aprobar cotización
              </Boton>
            </div>
          )}
        </section>
      </div>
      <p className="text-xs text-tinta-tenue">Cliente: {nombreCliente(cotizacion.clienteId)} · <Etiqueta>origen: texto + IA</Etiqueta></p>
    </div>
  );
}
