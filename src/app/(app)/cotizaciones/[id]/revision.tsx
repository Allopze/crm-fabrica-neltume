"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Download, Eye, Lock, PencilLine, Plus, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { Boton, BotonDescarga, BotonLink } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp, cn, fecha, fechaHora } from "@/lib/formato";
import { Descuento } from "./descuento";
import { SelectorArticulo } from "./selector-articulo";
import { TarjetaItem } from "./tarjeta-item";
import { TextoMarcado } from "./texto-marcado";
import type { CotizacionDetalle } from "./tipos";

const numeroPct = (f: number) => `${String(Math.round(f * 10_000) / 100).replace(".", ",")} %`;

interface Props {
  inicial: CotizacionDetalle;
  csrf: string;
  puedeAprobar: boolean;
  puedeDescontar: boolean;
  clientes: { id: string; nombre: string }[] | null;
}

export function Revision({ inicial, csrf, puedeAprobar, puedeDescontar, clientes }: Props) {
  const router = useRouter();
  const [c, setC] = useState(inicial);
  const [activo, setActivo] = useState<string | null>(null);
  const [vistaIA, setVistaIA] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [detalleLibre, setDetalleLibre] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  const aprobada = c.estado === "aprobada" || c.estado === "aceptada";
  const base = `/api/v1/cotizaciones/${c.id}`;
  // Los motivos visibles por los que Aprobar está deshabilitado se asocian al botón (UX §2).
  const motivosAprobar = [
    c.pendientes > 0 ? "aprobar-pendientes" : null,
    c.pendientes === 0 && !c.clienteId ? "aprobar-cliente" : null,
  ].filter((id): id is string => id !== null).join(" ") || undefined;

  // El servidor sigue siendo la fuente de verdad, pero un refresco no debe remontar la pantalla ni borrar lo tecleado.
  const [versionServidor, setVersionServidor] = useState(inicial.version);
  if (inicial.version !== versionServidor) {
    setVersionServidor(inicial.version);
    setC(inicial);
  }

  // Toda acción devuelve la cotización actualizada (con nueva versión) o un error legible.
  function accion(fn: () => Promise<CotizacionDetalle | unknown>, refrescar = false) {
    setError(null);
    iniciar(async () => {
      try {
        const r = await fn();
        if (r && typeof r === "object" && "items" in r) setC(r as CotizacionDetalle);
        if (refrescar) router.refresh();
      } catch (e) {
        setError(e);
        router.refresh();
      }
    });
  }
  if (confirmando && (aprobada || c.pendientes > 0 || !c.clienteId)) setConfirmando(false);
  const item = (itemId: string, cuerpo: object) => accion(() => pedir("PATCH", `${base}/items/${itemId}`, { csrf, cuerpo: { ...cuerpo, version: c.version } }));

  function agregarLibre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const detalle = detalleLibre.trim();
    if (!detalle) return;
    accion(async () => {
      const r = await pedir("POST", `${base}/items`, { csrf, cuerpo: { detalle, cantidad: 1, version: c.version } });
      setDetalleLibre("");
      return r;
    });
  }

  return (
    <div className="space-y-6">
      {aprobada ? (
        <div role="status" className="entrada flex flex-wrap items-center justify-between gap-4 rounded-lg border border-musgo/30 bg-musgo-velo px-5 py-4">
          <p className="flex items-center gap-2 text-musgo"><Lock className="h-4 w-4" />
            <span><strong>Aprobada por {c.aprobador}</strong>{c.aprobadaEn && <> el {fechaHora(new Date(c.aprobadaEn).toISOString())}</>} · precios congelados (lista v{c.lista.usada}) · {c.vencida ? "vencida" : `vigente hasta el ${fecha(c.vigenciaHasta!)}`}</span></p>
          <div className="flex flex-wrap gap-2">
            <BotonDescarga href={`${base}/pdf`}><Download className="h-4 w-4" /> PDF</BotonDescarga>
            {c.pedido && <BotonLink href={`/pedidos/${c.pedido.id}`}><ClipboardList className="h-4 w-4" /> Nota de pedido N.º {c.pedido.numero}{c.pedido.estado === "cancelada" ? " (cancelada)" : ""}</BotonLink>}
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
      <div className={cn("grid grid-cols-1 gap-6 [&>*]:min-w-0", c.textoOriginal ? "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : "max-w-3xl")}>
        {c.textoOriginal && (
          <section className="rounded-lg border border-linea bg-papel-hundido/50 p-6 xl:sticky xl:top-20 xl:self-start">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold text-tinta-suave">{vistaIA ? "Lo que recibió la IA" : "Texto original · tal como llegó"}</h2>
              <button type="button" aria-pressed={vistaIA} onClick={() => setVistaIA((v) => !v)} className="-my-2 inline-flex min-h-9 items-center gap-1.5 text-xs text-tinta-suave hover:text-tinta">
                <Eye className="h-3.5 w-3.5" /> {vistaIA ? "Ver original" : "Ver lo que recibió la IA"}
              </button>
            </div>
            <TextoMarcado texto={c.textoOriginal} items={c.items} activo={activo} onActivar={setActivo} vistaIA={vistaIA} />
          </section>
        )}

        <section>
          {error ? <ErrorAccion error={error} className="mb-3" /> : null}
          {c.estado === "ia_fallida" && (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-error/25 bg-error-velo px-4 py-3 text-sm text-error">
              <p><strong>No pudimos interpretar el pedido.</strong> El texto quedó guardado a la izquierda; agrega los ítems que reconozcas.</p>
              <Boton variante="peligro" onClick={() => document.getElementById("agregar-item")?.focus()}><PencilLine className="h-4 w-4" /> Cotizar a mano</Boton>
            </div>
          )}
          <h2 className="mb-3 text-sm font-semibold text-tinta-suave">Ítems · {c.items.length}</h2>
          <div className="space-y-3">
            {c.items.map((it, i) => (
              <TarjetaItem key={it.id} item={it} n={i + 1} activo={activo === it.id} bloqueado={aprobada || pendiente} soloLectura={aprobada} listaVersion={c.lista.vigente} onActivar={setActivo}
                acciones={{
                  resolver: (codigo) => item(it.id, { codigo }),
                  fijarPrecio: (precio) => item(it.id, { precioUnitario: precio }),
                  cantidad: (n) => item(it.id, { cantidad: n }),
                  quitar: () => accion(() => pedir("DELETE", `${base}/items/${it.id}?version=${c.version}`, { csrf })),
                }} />
            ))}
          </div>
          {!aprobada && (
            <>
              <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-linea-fuerte p-3">
                <Plus className="h-4 w-4 text-tinta-tenue" />
                <SelectorArticulo id="agregar-item" version={c.lista.vigente} etiqueta="Agregar ítem del catálogo" onElegir={(codigo) => accion(() => pedir("POST", `${base}/items`, { csrf, cuerpo: { codigo, cantidad: 1, version: c.version } }))} />
              </div>
              <form aria-label="Agregar línea por confirmar" onSubmit={agregarLibre}
                className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-linea-fuerte p-3">
                <input id="agregar-linea-libre" value={detalleLibre} onChange={(e) => setDetalleLibre(e.target.value)} maxLength={200}
                  placeholder="¿No está en el catálogo? Descríbelo (queda por confirmar)" aria-label="Artículo fuera de catálogo"
                  className={`${campo} min-w-0 flex-1`} />
                <Boton type="submit" disabled={!detalleLibre.trim() || pendiente}><Plus className="h-4 w-4" /> Agregar por confirmar</Boton>
              </form>
            </>
          )}

          <div className="mt-6 rounded-lg border border-linea-fuerte bg-lamina">
            {aprobada ? (
              <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3 text-sm">
                <span className="text-tinta-suave">Cliente</span><span className="font-medium">{c.cliente?.nombre ?? "—"}</span>
              </div>
            ) : clientes && (
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
              {Number(c.descuento) > 0 && <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">Descuento {numeroPct(Number(c.descuentoPct))} ({c.descuentoMotivo})</dt><dd className="tabular-nums">−{clp(Number(c.descuento))}</dd></div>}
              {puedeDescontar && !aprobada && (
                <div className="px-5 py-2.5">
                  <dt className="sr-only">Aplicar descuento</dt>
                  <dd><Descuento key={`${c.descuentoPct}:${c.descuentoMotivo}`} pct={Number(c.descuentoPct)} motivo={c.descuentoMotivo} deshabilitado={pendiente}
                    onAplicar={(porcentaje, motivo) => accion(() => pedir("POST", `${base}/descuento`, { csrf, cuerpo: { porcentaje, motivo, version: c.version } }))} /></dd>
                </div>
              )}
              <div className="flex justify-between px-5 py-2.5"><dt className="text-tinta-suave">IVA 19 %</dt><dd className="tabular-nums">{clp(Number(c.iva))}</dd></div>
              <div className="flex items-baseline justify-between px-5 py-4"><dt className="font-medium">Total</dt><dd className="font-display text-3xl font-medium tabular-nums tracking-tight">{clp(Number(c.total))}</dd></div>
            </dl>
            <p className="border-t border-linea px-5 py-2 text-xs text-tinta-tenue">Valores puestos en fábrica, flete aparte. Precios calculados por el sistema (lista v{c.lista.usada ?? c.lista.vigente}); la IA no fija importes.</p>
          </div>

          {!aprobada && puedeAprobar && !confirmando && (
            <div className="sticky bottom-0 z-10 -mx-1 mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-linea bg-papel/95 px-1 py-3 backdrop-blur">
              {c.pendientes > 0 && <p id="aprobar-pendientes" className="text-sm text-ambar">Resuelve {c.pendientes} {c.pendientes === 1 ? "ítem" : "ítems"} para poder aprobar.</p>}
              {c.pendientes === 0 && !c.clienteId && (
                <p id="aprobar-cliente" className="text-sm text-ambar">
                  {clientes ? "Elige el cliente para poder aprobar." : "Falta asignar el cliente. Pídelo a alguien con permiso para ver clientes."}
                </p>
              )}
              <Boton variante="primario" className={cn("h-11 px-5", c.pendientes === 0 && c.clienteId && "ring-4 ring-rauli/15")}
                disabled={pendiente || c.pendientes > 0 || !c.clienteId || c.items.length === 0}
                aria-describedby={motivosAprobar}
                onClick={() => setConfirmando(true)}>
                <Check className="h-4 w-4" /> Aprobar cotización
              </Boton>
            </div>
          )}
          {!aprobada && puedeAprobar && confirmando && (
            <div role="group" aria-labelledby="confirmar-aprobacion" className="mt-5 rounded-lg border border-rauli/30 bg-rauli-velo/50 p-5">
              <p id="confirmar-aprobacion" className="font-display text-lg font-medium">Aprobar la cotización N.º {c.numero}</p>
              <ul className="mt-2 space-y-1 text-sm text-tinta-suave">
                <li>{c.items.length === 1 ? "1 ítem" : `${c.items.length} ítems`} para <strong className="text-tinta">{clientes?.find((x) => x.id === c.clienteId)?.nombre ?? "el cliente elegido"}</strong> · total <strong className="text-tinta tabular-nums">{clp(Number(c.total))}</strong> IVA incluido.</li>
                <li>Los precios quedan congelados con la lista v{c.lista.usada ?? c.lista.vigente}, aunque la lista cambie después.</li>
                <li>Vigencia de {c.vigenciaDias} días hábiles desde hoy. Después ya no se puede editar: queda lista para el PDF y para convertirla en pedido.</li>
              </ul>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" disabled={pendiente} onClick={() => setConfirmando(false)}>Volver a revisar</Boton>
                <Boton variante="primario" className="h-11 px-5" disabled={pendiente} autoFocus
                  onClick={() => accion(() => pedir("POST", `${base}/aprobar`, { csrf, idempotente: true, cuerpo: { version: c.version } }), true)}>
                  <Check className="h-4 w-4" /> {pendiente ? "Aprobando…" : "Confirmar aprobación"}
                </Boton>
              </div>
            </div>
          )}
          {!aprobada && !puedeAprobar && (
            <p role="status" className="mt-5 rounded-md border border-linea bg-papel-hundido/60 px-4 py-3 text-sm text-tinta-suave">
              No tienes permiso para aprobar cotizaciones. Pídeselo a quien administra los usuarios.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
