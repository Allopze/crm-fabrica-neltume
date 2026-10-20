"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, Plus, Trash2 } from "lucide-react";
import { Boton, Panel, Placa } from "@/components/ui/base";
import { campoAlto as campo } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp } from "@/lib/formato";
import { type Opcion, SelectorArticulo } from "../[id]/selector-articulo";

type LineaNueva = { cantidad: number } & ({ codigo: string; opcion: Opcion } | { detalle: string });
type Linea = LineaNueva & { clave: string };

const suscribirTexto = () => () => {};
const leerTexto = () => {
  try { return sessionStorage.getItem("neltume:texto-pedido") ?? ""; } catch { return ""; }
};

/** Arma las líneas y crea el borrador; los importes definitivos los calcula el backend (REQ-COT-5.1). */
export function FormularioManual({ csrf, version, clientes }: { csrf: string; version: number | null; clientes: { id: string; nombre: string }[] | null }) {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const textoOriginal = useSyncExternalStore(suscribirTexto, leerTexto, () => "");
  const [detalle, setDetalle] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const referencia = lineas.reduce((t, l) => t + ("opcion" in l ? l.opcion.precioVenta * l.cantidad : 0), 0);

  const agregar = (l: LineaNueva) => setLineas((ls) => [...ls, { ...l, clave: crypto.randomUUID() }]);
  const cantidad = (clave: string, n: number) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(500, Math.max(1, n)) } : l)));

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const items = lineas.map((l) => ("codigo" in l ? { codigo: l.codigo, cantidad: l.cantidad } : { detalle: l.detalle, cantidad: l.cantidad }));
      const c = await pedir<{ id: string }>("POST", "/api/v1/cotizaciones", { csrf, idempotente: true, cuerpo: { items, clienteId: clienteId || null } });
      router.push(`/cotizaciones/${c.id}`);
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {textoOriginal && (
          <Panel titulo="Texto original del pedido">
            <p className="max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">{textoOriginal}</p>
          </Panel>
        )}
        <Panel titulo="Agregar artículo">
          {version ? (
            <SelectorArticulo version={version} etiqueta="Buscar artículo por código o modelo" onElegir={(codigo, opcion) => agregar({ codigo, opcion, cantidad: 1 })} />
          ) : <p className="text-sm text-ambar">Aún no hay lista de precios: importa el Excel primero.</p>}
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (detalle.trim()) { agregar({ detalle: detalle.trim(), cantidad: 1 }); setDetalle(""); } }}>
            <input value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={200} placeholder="¿No está en el catálogo? Descríbelo (queda por confirmar)"
              aria-label="Artículo fuera de catálogo" className={`${campo} min-w-60 flex-1`} />
            <Boton type="submit" disabled={!detalle.trim()}><Plus className="h-4 w-4" /> Línea por confirmar</Boton>
          </form>
        </Panel>

        <Panel titulo={`Líneas · ${lineas.length}`} sinRelleno>
          {lineas.length === 0 ? <p className="px-6 py-8 text-sm text-tinta-tenue">Busca un artículo para empezar.</p> : (
            <ul className="divide-y divide-linea">
              {lineas.map((l) => (
                <li key={l.clave} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  {"opcion" in l ? (
                    <span className="min-w-0 flex-1"><Placa codigo={l.codigo} /> <span className="ml-2 capitalize text-tinta-suave">{l.opcion.modelo.toLowerCase()} · {l.opcion.madera.toLowerCase()}</span></span>
                  ) : (
                    <span className="min-w-0 flex-1 text-ambar"><CircleHelp className="mr-1 inline h-3.5 w-3.5" />{l.detalle}</span>
                  )}
                  <input type="number" min={1} max={500} value={l.cantidad} onChange={(e) => cantidad(l.clave, Number(e.target.value))} aria-label="Cantidad"
                    className="h-9 w-20 rounded-md border border-linea-fuerte bg-lamina px-2 text-right tabular-nums focus:border-tinta focus:outline-none pointer-coarse:h-11" />
                  <span className="w-28 text-right tabular-nums">{"opcion" in l ? clp(l.opcion.precioVenta * l.cantidad) : "sin precio"}</span>
                  <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} aria-label={`Quitar ${"opcion" in l ? l.codigo : l.detalle}`}
                    className="-mr-2 grid h-9 w-9 place-items-center rounded-md text-tinta-tenue hover:bg-error-velo hover:text-error pointer-coarse:h-11 pointer-coarse:w-11"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel titulo="Resumen">
        {clientes && (
          <>
            <label className="text-sm font-medium" htmlFor="cli">Cliente</label>
            <select id="cli" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={`${campo} mt-1.5 w-full`}>
              <option value="">Elegir después</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </>
        )}
        <dl className="mt-5 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-tinta-suave">Neto de referencia</dt><dd>{clp(referencia)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-tinta-tenue">IVA y total los calcula el sistema al crear el borrador, con la lista v{version ?? "—"}.</p>
        {error ? <ErrorAccion error={error} className="mt-3 px-3 py-2" /> : null}
        <Boton variante="primario" className="mt-5 h-11 w-full" disabled={!lineas.length || enviando} onClick={crear}>
          {enviando ? "Creando…" : "Crear borrador"}
        </Boton>
      </Panel>
    </div>
  );
}
