"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Download, Eye, Lock, PencilLine, Plus, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { Boton, BotonDescarga, BotonLink } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { cn, fecha, fechaHora } from "@/lib/formato";
import { PistasBorrador, PlazoPedido } from "./pistas";
import { Aprobacion, Resumen } from "./resumen";
import { SelectorArticulo } from "./selector-articulo";
import { TarjetaItem } from "./tarjeta-item";
import { TextoMarcado } from "./texto-marcado";
import type { CotizacionDetalle } from "./tipos";

interface Props {
  inicial: CotizacionDetalle;
  csrf: string;
  puedeAprobar: boolean;
  puedeDescontar: boolean;
  puedeCrearCliente: boolean;
  clientes: { id: string; nombre: string }[] | null;
}

export function Revision({ inicial, csrf, puedeAprobar, puedeDescontar, puedeCrearCliente, clientes }: Props) {
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

  const items = (
    <>
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
              className={`${campo} min-w-0 flex-1 basis-60`} />
            <Boton type="submit" disabled={!detalleLibre.trim() || pendiente} className="max-sm:w-full"><Plus className="h-4 w-4" /> Agregar por confirmar</Boton>
          </form>
        </>
      )}
    </>
  );

  const resumen = (
    <Resumen c={c} clientes={clientes} aprobada={aprobada} pendiente={pendiente} puedeDescontar={puedeDescontar}
      onCliente={(clienteId) => accion(() => pedir("PATCH", base, { csrf, cuerpo: { clienteId, version: c.version } }))}
      onDescuento={(porcentaje, motivo) => accion(() => pedir("POST", `${base}/descuento`, { csrf, cuerpo: { porcentaje, motivo, version: c.version } }))} />
  );

  const aprobacion = aprobada ? null : puedeAprobar ? (
    <Aprobacion c={c} clientes={clientes} pendiente={pendiente} confirmando={confirmando} lateral={!c.textoOriginal}
      onConfirmar={() => setConfirmando(true)} onCancelar={() => setConfirmando(false)}
      onAprobar={() => accion(() => pedir("POST", `${base}/aprobar`, { csrf, idempotente: true, cuerpo: { version: c.version } }), true)} />
  ) : (
    <p role="status" className={cn("rounded-md border border-linea bg-papel-hundido/60 px-4 py-3 text-sm text-tinta-suave", c.textoOriginal && "mt-5")}>
      No tienes permiso para aprobar cotizaciones. Pídeselo a quien administra los usuarios.
    </p>
  );

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
      ) : null}
      {aprobada ? (c.pistas.plazo && <PlazoPedido plazo={c.pistas.plazo} />) : (
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
          <PistasBorrador pistas={c.pistas} deshabilitado={pendiente} puedeCrearCliente={puedeCrearCliente}
            onAsignar={(clienteId, por) => accion(() => pedir("PATCH", base, { csrf, cuerpo: { clienteId, clienteDetectadoPor: por, version: c.version } }))} />
        </>
      )}
      {c.textoOriginal ? (
        <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="rounded-lg border border-linea bg-papel-hundido/50 p-6 xl:sticky xl:top-20 xl:self-start">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold text-tinta-suave">{vistaIA ? "Lo que recibió la IA" : "Texto original · tal como llegó"}</h2>
              <button type="button" aria-pressed={vistaIA} onClick={() => setVistaIA((v) => !v)} className="-my-2 inline-flex min-h-9 items-center gap-1.5 text-xs text-tinta-suave hover:text-tinta">
                <Eye className="h-3.5 w-3.5" /> {vistaIA ? "Ver original" : "Ver lo que recibió la IA"}
              </button>
            </div>
            <TextoMarcado texto={c.textoOriginal} items={c.items} activo={activo} onActivar={setActivo} vistaIA={vistaIA} />
          </section>
          <section>
            {items}
            <div className="mt-6">{resumen}</div>
            {aprobacion}
          </section>
        </div>
      ) : (
        // Sin texto del cliente, el resumen va en una columna fija: cliente, totales y Aprobar siempre a la vista (UX §3).
        <div className="grid grid-cols-1 items-start gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <section>{items}</section>
          <aside aria-label="Resumen de la cotización" className="space-y-4 lg:sticky lg:top-20">
            {resumen}
            {aprobacion}
          </aside>
        </div>
      )}
    </div>
  );
}
