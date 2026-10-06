"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Eye, Lock, PencilLine, Plus, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { Boton, BotonDescarga, BotonLink } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";
import { clp, cn, fecha } from "@/lib/formato";
import { SelectorArticulo } from "./selector-articulo";
import { TarjetaItem } from "./tarjeta-item";
import { TextoMarcado } from "./texto-marcado";
import type { CotizacionDetalle } from "./tipos";

interface Props {
  inicial: CotizacionDetalle;
  csrf: string;
  puedeAprobar: boolean;
  clientes: { id: string; nombre: string }[] | null;
}

export function Revision({ inicial, csrf, puedeAprobar, clientes }: Props) {
  const router = useRouter();
  const [c, setC] = useState(inicial);
  const [activo, setActivo] = useState<string | null>(null);
  const [vistaIA, setVistaIA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const aprobada = c.estado === "aprobada" || c.estado === "aceptada";
  const base = `/api/v1/cotizaciones/${c.id}`;

  // Toda acción devuelve la cotización actualizada (con nueva versión) o un error legible.
  function accion(fn: () => Promise<CotizacionDetalle | unknown>, refrescar = false) {
    setError(null);
    iniciar(async () => {
      try {
        const r = await fn();
        if (r && typeof r === "object" && "items" in r) setC(r as CotizacionDetalle);
        if (refrescar) router.refresh();
      } catch (e) {
        setError((e as Error).message);
        router.refresh();
      }
    });
  }
  const item = (itemId: string, cuerpo: object) => accion(() => pedir("PATCH", `${base}/items/${itemId}`, { csrf, cuerpo: { ...cuerpo, version: c.version } }));

  return (
    <div className="space-y-6">
      {aprobada ? (
        <div role="status" className="entrada flex flex-wrap items-center justify-between gap-4 rounded-lg border border-musgo/30 bg-musgo-velo px-5 py-4">
          <p className="flex items-center gap-2 text-musgo"><Lock className="h-4 w-4" />
            <span><strong>Aprobada por {c.aprobador}</strong> · precios congelados (lista v{c.lista.usada}) · {c.vencida ? "vencida" : `vigente hasta el ${fecha(c.vigenciaHasta!)}`}</span></p>
          <div className="flex gap-2">
            <BotonDescarga href={`${base}/pdf`}><Download className="h-4 w-4" /> PDF</BotonDescarga>
            {c.estado === "aprobada" && !c.vencida && <BotonLink href={`/pedidos/nuevo?cotizacion=${c.id}`} variante="primario"><Truck className="h-4 w-4" /> Convertir en pedido</BotonLink>}
          </div>
        </div>
      ) : (
        <>
          {(c.alertas as string[]).map((a) => (
            <div key={a} role="alert" className="flex items-start gap-3 rounded-lg border border-error/25 bg-error-velo px-5 py-3.5 text-sm text-error">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Revisar el texto del cliente.</strong> {a} La IA no aplica descuentos ni fija precios.</p>
            </div>
          ))}
          {c.lista.desactualizada && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pizarra/30 bg-pizarra-velo px-5 py-3 text-sm text-pizarra">
              <span>Este borrador usa la lista v{c.lista.usada}; la vigente es la v{c.lista.vigente}.</span>
              <Boton onClick={() => accion(() => pedir("POST", `${base}/recalcular`, { csrf, cuerpo: { version: c.version } }))}><RotateCcw className="h-4 w-4" /> Recalcular con la lista vigente</Boton>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="rounded-md border border-error/25 bg-error-velo px-4 py-2 text-sm text-error">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {c.textoOriginal ? (
          <section className="rounded-lg border border-linea bg-papel-hundido/50 p-6 xl:sticky xl:top-20 xl:self-start">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">{vistaIA ? "Lo que recibió la IA" : "Texto original · tal como llegó"}</h2>
              <button onClick={() => setVistaIA((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-tinta-suave hover:text-tinta">
                <Eye className="h-3.5 w-3.5" /> {vistaIA ? "Ver original" : "Ver lo que recibió la IA"}
              </button>
            </div>
            <TextoMarcado texto={c.textoOriginal} items={c.items} activo={activo} onActivar={setActivo} vistaIA={vistaIA} />
          </section>
        ) : <section className="rounded-lg border border-dashed border-linea p-6 text-sm text-tinta-tenue">Cotización manual: sin texto del cliente.</section>}

        <section>
          {c.estado === "ia_fallida" && (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-error/25 bg-error-velo px-4 py-3 text-sm text-error">
              <p><strong>No pudimos interpretar el pedido.</strong> El texto quedó guardado a la izquierda.</p>
              <Boton variante="peligro" onClick={() => document.getElementById("agregar-item")?.focus()}><PencilLine className="h-4 w-4" /> Cotizar a mano</Boton>
            </div>
          )}
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-tenue">Ítems · {c.items.length}</h2>
          <div className="space-y-3">
            {c.items.map((it, i) => (
              <TarjetaItem key={it.id} item={it} n={i + 1} activo={activo === it.id} bloqueado={aprobada || pendiente} listaVersion={c.lista.vigente} onActivar={setActivo}
                acciones={{
                  resolver: (codigo) => item(it.id, { codigo }),
                  fijarPrecio: (precio) => item(it.id, { precioUnitario: precio }),
                  cantidad: (n) => item(it.id, { cantidad: n }),
                  quitar: () => accion(() => pedir("DELETE", `${base}/items/${it.id}?version=${c.version}`, { csrf })),
                }} />
            ))}
          </div>
          {!aprobada && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-linea-fuerte p-3">
              <Plus className="h-4 w-4 text-tinta-tenue" />
              <SelectorArticulo id="agregar-item" version={c.lista.vigente} etiqueta="Agregar ítem del catálogo" onElegir={(codigo) => accion(() => pedir("POST", `${base}/items`, { csrf, cuerpo: { codigo, cantidad: 1, version: c.version } }))} />
            </div>
          )}

          <div className="mt-6 rounded-lg border border-linea-fuerte bg-lamina">
            {clientes && (
              <label className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3 text-sm">
                <span className="text-tinta-suave">Cliente</span>
                <select disabled={aprobada || pendiente} value={c.clienteId ?? ""} aria-label="Cliente"
                  onChange={(e) => accion(() => pedir("PATCH", base, { csrf, cuerpo: { clienteId: e.target.value || null, version: c.version } }))}
                  className="h-9 max-w-xs rounded-md border border-linea-fuerte bg-lamina px-2 text-sm">
                  <option value="">Elegir cliente…</option>
                  {clientes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
            )}
            <dl className="divide-y divide-linea/70 text-sm">
              <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">Subtotal neto</dt><dd className="tabular-nums">{clp(Number(c.subtotal))}</dd></div>
              {Number(c.descuento) > 0 && <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">Descuento ({c.descuentoMotivo})</dt><dd className="tabular-nums">−{clp(Number(c.descuento))}</dd></div>}
              <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">IVA 19 %</dt><dd className="tabular-nums">{clp(Number(c.iva))}</dd></div>
              <div className="flex items-baseline justify-between px-5 py-4"><dt className="font-medium">Total</dt><dd className="font-display text-3xl font-medium tabular-nums tracking-tight">{clp(Number(c.total))}</dd></div>
            </dl>
            <p className="border-t border-linea px-5 py-2 text-xs text-tinta-tenue">Valores puestos en fábrica, flete aparte. Precios calculados por el sistema (lista v{c.lista.usada ?? c.lista.vigente}); la IA no fija importes.</p>
          </div>

          {!aprobada && puedeAprobar && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              {c.pendientes > 0 && <p className="text-sm text-ambar">Resuelve {c.pendientes} {c.pendientes === 1 ? "ítem" : "ítems"} para poder aprobar.</p>}
              {c.pendientes === 0 && !c.clienteId && <p className="text-sm text-ambar">Elige el cliente para poder aprobar.</p>}
              <Boton variante="primario" className={cn("h-11 px-5", c.pendientes === 0 && c.clienteId && "ring-4 ring-rauli/15")}
                disabled={pendiente || c.pendientes > 0 || !c.clienteId || c.items.length === 0}
                onClick={() => accion(() => pedir("POST", `${base}/aprobar`, { csrf, idempotente: true, cuerpo: { version: c.version } }), true)}>
                <Check className="h-4 w-4" /> Aprobar cotización
              </Boton>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
