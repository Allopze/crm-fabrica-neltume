"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Aviso, Boton, Etiqueta, Panel } from "@/components/ui/base";
import type { EstadoAjustesIA, ModeloIA, ProveedorConfigurado } from "@/ai/ajustes";
import { pedir } from "@/lib/api-cliente";

const campo = "h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const fecha = (iso: string | null) => iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "aún no consultado";
const precios = (m: ModeloIA) => m.precioEntradaUsdMTok === undefined ? "tarifa no disponible" : `US$ ${m.precioEntradaUsdMTok} entrada / US$ ${m.precioSalidaUsdMTok} salida por millón`;
const NOMBRE_PROVEEDOR: Record<string, string> = { commandcode: "Command Code", groq: "Groq" };
const limites = (m: ModeloIA) => m.limites ? `RPM ${m.limites.rpm ?? "—"} · RPD ${m.limites.rpd ?? "—"} · TPM ${m.limites.tpm ?? "—"} · TPD ${m.limites.tpd ?? "—"}` : "Sin límite Free publicado";

export function AjustesIA({ csrf }: { csrf: string }) {
  const [estado, setEstado] = useState<EstadoAjustesIA | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorConfigurado>("commandcode");
  const [modelo, setModelo] = useState("");
  const [zdr, setZdr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cargar = useCallback(async () => {
    const datos = await pedir<EstadoAjustesIA>("GET", "/api/v1/ajustes/ia");
    setEstado(datos);
    if (datos.proveedor) setProveedor(datos.proveedor);
    if (datos.modelo) setModelo(datos.modelo);
    setZdr(datos.groqZdrConfirmado);
  }, []);
  useEffect(() => {
    let montado = true;
    void pedir<EstadoAjustesIA>("GET", "/api/v1/ajustes/ia").then((datos) => {
      if (!montado) return;
      setEstado(datos);
      if (datos.proveedor) setProveedor(datos.proveedor);
      if (datos.modelo) setModelo(datos.modelo);
      setZdr(datos.groqZdrConfirmado);
    }).catch((e) => { if (montado) setError((e as Error).message); });
    return () => { montado = false; };
  }, []);
  const modelos = useMemo(() => estado?.catalogos[proveedor].modelos ?? [], [estado, proveedor]);
  // En la tabla, primero lo que se puede activar.
  const ordenados = useMemo(() => [...modelos].sort((a, b) => Number(b.compatible && !b.preview) - Number(a.compatible && !a.preview)), [modelos]);
  const modeloElegido = modelos.find((m) => m.id === modelo);

  async function activar() {
    setError(null); setAviso(null);
    try {
      await pedir("PUT", "/api/v1/ajustes/ia", { csrf, cuerpo: { proveedorActivo: proveedor, modelo, groqZdrConfirmado: zdr } });
      await cargar();
      setAviso("Configuración activa. Se aplicará a los trabajos que comiencen desde ahora.");
    } catch (e) { setError((e as Error).message); }
  }

  if (!estado) return <Panel><p className="text-sm text-tinta-suave">Cargando configuración de proveedores…</p></Panel>;
  return <div className="space-y-6">
    {error && <Aviso tono="error" titulo="No se guardaron los cambios">{error}</Aviso>}
    {aviso && <Aviso tono="musgo" titulo="Listo">{aviso}</Aviso>}
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <Panel titulo="Proveedor y modelo">
        <div className="space-y-5">
          <label className="block space-y-1.5 text-sm font-medium">Proveedor
            <select className={campo} value={proveedor} onChange={(e) => { setProveedor(e.target.value as ProveedorConfigurado); setModelo(""); }}>
              <option value="commandcode">Command Code</option><option value="groq">Groq</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">Modelo
            <select className={campo} value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">Selecciona un modelo</option>
              {modelos.map((m) => <option key={m.id} value={m.id} disabled={!m.compatible || m.preview}>
                {m.nombre} · {proveedor === "commandcode" ? precios(m) : limites(m)}{m.motivo ? ` · ${m.motivo}` : ""}
              </option>)}
            </select>
          </label>
          {modelos.length === 0 && <Aviso titulo="Aún no hay modelos de este proveedor">Falta su clave en el servidor. Pídesela a quien administra el sistema: al reiniciar, el catálogo se carga solo.</Aviso>}
          {modeloElegido && <div className="rounded-md border border-linea bg-papel px-4 py-3 text-sm">
            <div className="flex items-center gap-2"><span className="font-medium">{modeloElegido.nombre}</span>{modeloElegido.preview && <Etiqueta tono="ambar">Preview</Etiqueta>}{modeloElegido.compatible && <Etiqueta tono="musgo">Compatible</Etiqueta>}</div>
            <p className="mt-1 font-mono text-xs text-tinta-tenue">{modeloElegido.id}</p>
            {modeloElegido.motivo && <p className="mt-2 text-error">{modeloElegido.motivo}</p>}
            {modeloElegido.modoRazonamiento && <p className="mt-2 text-tinta-suave">Modo efectivo: {modeloElegido.modoRazonamiento}{modeloElegido.modeloEfectivo !== modeloElegido.id ? ` · ${modeloElegido.modeloEfectivo}` : ""}</p>}
            {proveedor === "commandcode" ? <p className="mt-2 text-tinta-suave">{precios(modeloElegido)} · tarifa publicada</p> : <p className="mt-2 text-tinta-suave">Límites Free de referencia: {limites(modeloElegido)}</p>}
          </div>}
          {proveedor === "groq" && <label className="flex items-start gap-3 rounded-md border border-ambar/30 bg-ambar-velo p-3 text-sm text-ambar">
            <input type="checkbox" className="mt-0.5 accent-current" checked={zdr} onChange={(e) => setZdr(e.target.checked)} />
            <span>Confirmo que activé Zero Data Retention (ZDR) para el proyecto en Groq Console. La app no puede comprobarlo.</span>
          </label>}
          <Boton variante="primario" disabled={pendiente || !modelo || !modeloElegido?.compatible || modeloElegido.preview} onClick={() => iniciar(() => void activar())}>
            <Check className="h-4 w-4" /> {pendiente ? "Activando…" : "Activar proveedor y modelo"}
          </Boton>
          {estado.proveedor && <p className="text-sm text-tinta-suave">Activo ahora: <strong className="text-tinta">{NOMBRE_PROVEEDOR[estado.proveedor] ?? estado.proveedor}</strong> · {estado.modelo}{estado.catalogos[estado.proveedor].modelos.find((m) => m.id === estado.modelo)?.modoRazonamiento ? ` · ${estado.catalogos[estado.proveedor].modelos.find((m) => m.id === estado.modelo)?.modoRazonamiento}` : " · Esfuerzo predeterminado del proveedor"}</p>}
        </div>
      </Panel>

      <Panel titulo="Claves de los proveedores">
        <div className="space-y-4">
          <p className="text-sm text-tinta-suave">Por seguridad, las claves no se escriben en esta pantalla y la app web nunca las recibe. Las instala quien administra el servidor, en el entorno del proceso que habla con la IA.</p>
          <div>
            <p className="text-xs font-semibold text-tinta-tenue">Para quien administra el servidor</p>
            <p className="mt-1 text-xs leading-relaxed text-tinta-tenue">En desarrollo van en el archivo <code className="font-mono">.env.worker.local</code>; en producción, como variables del servicio <code className="font-mono">worker</code>. Después de cambiarlas, reinicia ese proceso.</p>
            <pre className="mt-2 overflow-auto rounded-md border border-linea bg-papel p-3 font-mono text-xs leading-relaxed">{`CMD_API_KEY=\nGROQ_API_KEY=`}</pre>
          </div>
        </div>
      </Panel>
    </div>

    <Panel titulo={proveedor === "commandcode" ? "Tarifas publicadas" : "Límites del plan Free"} accion={<span className="flex items-center gap-1.5 text-xs text-tinta-tenue"><RefreshCw className="h-3.5 w-3.5" /> Consultado: {fecha(estado.catalogos[proveedor].actualizadoEn)}</span>}>
      {proveedor === "groq" && <Aviso titulo="Referencia pública, no cuota de esta organización">
        Los límites exactos se revisan en Groq Console. Los headers de la API reflejan RPD y TPM; no se usan para deducir RPM. Fuente: <a className="underline" href={estado.catalogos.groq.fuente} target="_blank" rel="noreferrer">documentación de límites de Groq</a>.
      </Aviso>}
      {proveedor === "commandcode" && <p className="mb-4 text-sm text-tinta-suave">Tarifas de referencia por millón de tokens, consultadas desde <a className="underline" href={estado.catalogos.commandcode.fuente} target="_blank" rel="noreferrer">precios oficiales de Command Code</a>.</p>}
      <div role="region" aria-label="Tarifas publicadas" tabIndex={0} className="mt-4 max-h-[420px] overflow-auto rounded-md border border-linea">
        {modelos.length === 0 ? <p className="p-5 text-sm text-tinta-tenue">El catálogo de este proveedor aún no se ha cargado.</p> : <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-papel text-xs uppercase tracking-wide text-tinta-tenue"><tr><th className="px-4 py-2">Modelo</th><th className="px-4 py-2">{proveedor === "commandcode" ? "Tarifa / 1M" : "RPM · RPD · TPM · TPD"}</th><th className="px-4 py-2">Modo</th><th className="px-4 py-2">Estado</th></tr></thead>
          <tbody>{ordenados.map((m) => <tr key={m.id} className="border-t border-linea align-top"><td className="px-4 py-2"><span className="font-medium">{m.nombre}</span><span className="mt-0.5 block font-mono text-xs text-tinta-tenue">{m.id}</span></td><td className="px-4 py-2 text-xs tabular-nums">{proveedor === "commandcode" ? precios(m) : limites(m)}</td><td className="px-4 py-2 text-xs text-tinta-suave">{m.modoRazonamiento ?? "Sin verificar"}</td><td className="px-4 py-2">{m.compatible && !m.preview ? <Etiqueta tono="musgo">Disponible</Etiqueta> : <span className="text-xs text-tinta-suave">{m.motivo ?? "No disponible"}</span>}</td></tr>)}</tbody>
        </table>}
      </div>
    </Panel>
  </div>;
}
