"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Aviso, Boton, Etiqueta, Panel } from "@/components/ui/base";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorAccion } from "@/components/ui/error-accion";
import type { EstadoAjustesIA, ModeloIA } from "@/ai/ajustes";
import { pedir } from "@/lib/api-cliente";
import { fechaHora, usd } from "@/lib/formato";

const fecha = (iso: string | null) => iso ? fechaHora(iso) : "aún no consultado";
const precios = (m: ModeloIA) => m.precioEntradaUsdMTok === undefined ? "tarifa no disponible" : `${usd(m.precioEntradaUsdMTok)} entrada / ${usd(m.precioSalidaUsdMTok)} salida por millón`;

/** Modelo de Command Code que interpreta los pedidos (REQ-ADM-4.x, ADR-0022). La clave vive en el entorno del worker. */
export function AjustesIA({ csrf }: { csrf: string }) {
  const [estado, setEstado] = useState<EstadoAjustesIA | null>(null);
  const [modelo, setModelo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const aplicar = useCallback((datos: EstadoAjustesIA) => {
    setEstado(datos);
    if (datos.modelo) setModelo(datos.modelo);
  }, []);
  useEffect(() => {
    let montado = true;
    void pedir<EstadoAjustesIA>("GET", "/api/v1/ajustes/ia").then((datos) => { if (montado) aplicar(datos); }).catch((e) => { if (montado) setError(e); });
    return () => { montado = false; };
  }, [aplicar]);
  const catalogo = estado?.catalogos.commandcode;
  const modelos = useMemo(() => catalogo?.modelos ?? [], [catalogo]);
  // En la tabla, primero lo que se puede activar.
  const ordenados = useMemo(() => [...modelos].sort((a, b) => Number(b.compatible && !b.preview) - Number(a.compatible && !a.preview)), [modelos]);
  const modeloElegido = modelos.find((m) => m.id === modelo);
  const activo = estado?.modelo ? modelos.find((m) => m.id === estado.modelo) : undefined;

  async function activar() {
    setError(null); setAviso(null);
    try {
      await pedir("PUT", "/api/v1/ajustes/ia", { csrf, cuerpo: { proveedorActivo: "commandcode", modelo } });
      aplicar(await pedir<EstadoAjustesIA>("GET", "/api/v1/ajustes/ia"));
      setAviso("Configuración activa. Se aplicará a los pedidos que se interpreten desde ahora.");
    } catch (e) { setError(e); }
  }

  if (!estado || !catalogo) return <Panel>{error ? <ErrorAccion error={error} /> : <p className="text-sm text-tinta-suave">Cargando configuración…</p>}</Panel>;
  return <div className="space-y-6">
    {error ? <ErrorAccion error={error} /> : null}
    {aviso && <Aviso tono="musgo" titulo="Listo">{aviso}</Aviso>}
    {!estado.proveedor && (
      <Aviso titulo="No hay un modelo activo">Mientras no elijas uno, los pedidos pegados quedan como «IA no disponible» y se cotizan a mano.</Aviso>
    )}
    <div className="grid grid-cols-1 items-start gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <Panel titulo="Modelo">
        <div className="space-y-5">
          <p className="text-sm text-tinta-suave">Proveedor: <strong className="text-tinta">Command Code</strong>, siempre con retención cero (no guarda los pedidos que le enviamos).</p>
          <div className="block space-y-1.5 text-sm font-medium">Modelo
            <Dropdown aria-label="Modelo" className="w-full" value={modelo} onChange={setModelo}>
              <option value="">Selecciona un modelo…</option>
              {modelos.map((m) => <option key={m.id} value={m.id} disabled={!m.compatible || m.preview}>
                {m.nombre} · {precios(m)}{m.motivo ? ` · ${m.motivo}` : ""}
              </option>)}
            </Dropdown>
          </div>
          {modelos.length === 0 && <Aviso titulo="Aún no hay modelos">Falta la clave de Command Code en el servidor. Pídesela a quien administra el sistema: al reiniciar, el catálogo se carga solo.</Aviso>}
          {modeloElegido && <div className="rounded-md border border-linea bg-papel px-4 py-3 text-sm">
            <div className="flex items-center gap-2"><span className="font-medium">{modeloElegido.nombre}</span>{modeloElegido.preview && <Etiqueta tono="ambar">Preview</Etiqueta>}{modeloElegido.compatible && <Etiqueta tono="musgo">Compatible</Etiqueta>}</div>
            <p className="mt-1 font-mono text-xs text-tinta-tenue">{modeloElegido.id}</p>
            {modeloElegido.motivo && <p className="mt-2 text-error">{modeloElegido.motivo}</p>}
            {modeloElegido.modoRazonamiento && <p className="mt-2 text-tinta-suave">Modo efectivo: {modeloElegido.modoRazonamiento}{modeloElegido.modeloEfectivo !== modeloElegido.id ? ` · ${modeloElegido.modeloEfectivo}` : ""}</p>}
            <p className="mt-2 text-tinta-suave">{precios(modeloElegido)} · tarifa publicada</p>
          </div>}
          <Boton variante="primario" disabled={pendiente || !modelo || !modeloElegido?.compatible || modeloElegido.preview} onClick={() => iniciar(() => void activar())}>
            <Check className="h-4 w-4" /> {pendiente ? "Activando…" : "Activar modelo"}
          </Boton>
          {estado.proveedor && <p className="text-sm text-tinta-suave">Activo ahora: <strong className="text-tinta">{activo?.nombre ?? estado.modelo}</strong> · {activo?.modoRazonamiento ?? "Esfuerzo predeterminado del proveedor"}</p>}
        </div>
      </Panel>

      <Panel titulo="Clave del proveedor">
        <div className="space-y-4">
          <p className="text-sm text-tinta-suave">Por seguridad, la clave no se escribe en esta pantalla y la app web nunca la recibe. La instala quien administra el servidor, en el entorno del proceso que habla con la IA.</p>
          <div>
            <p className="text-xs font-semibold text-tinta-tenue">Para quien administra el servidor</p>
            <p className="mt-1 text-xs leading-relaxed text-tinta-tenue">Si falta o se cambia, hay que reiniciar ese proceso. Si no la tienes, pídesela a quien administra el sistema.</p>
          </div>
        </div>
      </Panel>
    </div>

    <Panel titulo="Tarifas publicadas" accion={<span className="flex items-center gap-1.5 text-xs text-tinta-tenue"><RefreshCw className="h-3.5 w-3.5" /> Consultado: {fecha(catalogo.actualizadoEn)}</span>}>
      <p className="mb-4 text-sm text-tinta-suave">Tarifas de referencia por millón de tokens, consultadas desde <a className="underline" href={catalogo.fuente} target="_blank" rel="noreferrer">precios oficiales de Command Code</a>.</p>
      <div role="region" aria-label="Tarifas publicadas" tabIndex={0} className="mt-4 max-h-[420px] overflow-auto rounded-md border border-linea">
        {modelos.length === 0 ? <p className="p-5 text-sm text-tinta-tenue">El catálogo aún no se ha cargado.</p> : <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-papel text-xs uppercase tracking-wide text-tinta-tenue"><tr><th className="px-4 py-2">Modelo</th><th className="px-4 py-2">Tarifa / 1M</th><th className="px-4 py-2">Modo</th><th className="px-4 py-2">Estado</th></tr></thead>
          <tbody>{ordenados.map((m) => <tr key={m.id} className="border-t border-linea align-top"><td className="px-4 py-2"><span className="font-medium">{m.nombre}</span><span className="mt-0.5 block font-mono text-xs text-tinta-tenue">{m.id}</span></td><td className="px-4 py-2 text-xs tabular-nums">{precios(m)}</td><td className="px-4 py-2 text-xs text-tinta-suave">{m.modoRazonamiento ?? "Sin verificar"}</td><td className="px-4 py-2">{m.compatible && !m.preview ? <Etiqueta tono="musgo">Disponible</Etiqueta> : <span className="text-xs text-tinta-suave">{m.motivo ?? "No disponible"}</span>}</td></tr>)}</tbody>
        </table>}
      </div>
    </Panel>
  </div>;
}
