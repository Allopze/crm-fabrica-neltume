"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Send } from "lucide-react";
import { Aviso, Boton, Etiqueta, Hecho, Panel, Vacio } from "@/components/ui/base";
import { ErrorAccion } from "@/components/ui/error-accion";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import type { estadoConexion, PruebaVista } from "@/domain/integracion-tienda/conexion-datos";
import { pedir } from "@/lib/api-cliente";
import { cn, fechaHora, nombrePropio } from "@/lib/formato";

type Estado = Awaited<ReturnType<typeof estadoConexion>>;
type Tono = "neutro" | "musgo" | "ambar" | "pizarra" | "error";

const RUTA = "/api/v1/integracion/tienda/pruebas";
const EN_ESPERA = new Set(["pendiente", "enviando"]);
/** Hasta cuándo se espera el resultado, y desde cuándo se avisa que el servicio de enlace tarda. */
const ESPERA_MAX_MS = 30_000;
const AVISO_LENTO_MS = 20_000;
const ACTUALIZA_CADA_MS = 10_000;

const ESTADOS: Record<string, { texto: string; tono: Tono }> = {
  recibida: { texto: "Recibida", tono: "musgo" }, pendiente: { texto: "Pendiente", tono: "neutro" }, enviando: { texto: "Enviando", tono: "pizarra" },
  aceptada: { texto: "Aceptada", tono: "musgo" }, duplicada: { texto: "Aceptada (repetida)", tono: "musgo" }, rechazada: { texto: "Rechazada", tono: "error" },
  sin_respuesta: { texto: "Sin respuesta", tono: "ambar" }, no_configurada: { texto: "Sin configurar", tono: "ambar" }, vencida: { texto: "Vencida", tono: "ambar" },
};
const TITULOS: Record<string, string> = {
  rechazada: "La tienda rechazó la prueba", sin_respuesta: "No hubo respuesta de la tienda",
  no_configurada: "Falta configurar el envío", vencida: "La prueba venció antes de enviarse",
};

/** Resultado de la prueba que se acaba de pedir: lo que dice el diagnóstico del servicio de enlace. */
function Resultado({ p, lento }: { p: PruebaVista; lento: boolean }) {
  if (EN_ESPERA.has(p.estado)) {
    if (!lento) return <p role="status" className="text-sm text-tinta-suave">Esperando la respuesta de la tienda…</p>;
    // Solo una prueba que nadie tomó delata un servicio de enlace caído; una que ya se está enviando espera a una tienda lenta.
    return p.estado === "pendiente"
      ? <Aviso titulo="El servicio de enlace no responde">
        La prueba sigue pendiente: nadie la tomó todavía. Pide a quien administra el servidor que revise el servicio «enlace» (perfil «tienda»). Cuando la tome, aparecerá en la lista.
      </Aviso>
      : <p role="status" className="text-sm text-tinta-suave">La tienda está tardando más de lo normal en responder…</p>;
  }
  if (p.estado === "aceptada" || p.estado === "duplicada") {
    return <Hecho>{p.detalle} Busca el PDF con el código <strong className="font-mono">{p.codigo}</strong> en los Ajustes de la tienda.</Hecho>;
  }
  return <Aviso tono={p.estado === "rechazada" ? "error" : "ambar"} titulo={TITULOS[p.estado] ?? "La prueba no se envió"}>{p.detalle}</Aviso>;
}

/** Conexión con la tienda (REQ-ADM-5.1–5.4, ADR-0024): botón de prueba, estado y últimas pruebas de los dos sentidos. */
export function ConexionTienda({ csrf, inicial }: { csrf: string; inicial: Estado }) {
  const [estado, setEstado] = useState(inicial);
  const [prueba, setPrueba] = useState<PruebaVista | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [lento, setLento] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const montado = useRef(true);
  const ocupado = useRef(false);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const refrescar = useCallback(async () => {
    try {
      const nuevo = await pedir<Estado>("GET", RUTA);
      if (montado.current) setEstado(nuevo);
    } catch { /* la lista se pone al día en la próxima consulta */ }
  }, []);

  async function actualizar() {
    setActualizando(true);
    await refrescar();
    if (montado.current) setActualizando(false);
  }

  // La lista se actualiza sola mientras la pestaña está a la vista: así la prueba que manda la tienda aparece sin recargar.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !ocupado.current) void refrescar(); }, ACTUALIZA_CADA_MS);
    return () => clearInterval(t);
  }, [refrescar]);

  async function enviar() {
    setError(null); setPrueba(null); setLento(false); setEnCurso(true);
    ocupado.current = true;
    try {
      const { id } = await pedir<{ id: string }>("POST", RUTA, { csrf, idempotente: true });
      const inicio = Date.now();
      for (;;) {
        const p = await pedir<PruebaVista>("GET", `${RUTA}/${id}`);
        if (!montado.current) return;
        setPrueba(p);
        const espera = Date.now() - inicio;
        if (!EN_ESPERA.has(p.estado) || espera >= ESPERA_MAX_MS) break;
        if (espera >= AVISO_LENTO_MS) setLento(true);
        await new Promise((ok) => setTimeout(ok, 1_000));
      }
    } catch (e) {
      if (montado.current) setError(e);
    } finally {
      ocupado.current = false;
      if (montado.current) { setEnCurso(false); await refrescar(); }
    }
  }

  const { recepcion, envio, pruebas } = estado;
  const dt = "text-xs font-semibold uppercase tracking-[0.08em] text-tinta-tenue";
  return <div className="space-y-6">
    <Panel titulo="Estado">
      <dl className="grid grid-cols-1 gap-x-10 gap-y-5 text-sm sm:grid-cols-2">
        <div>
          <dt className={dt}>La tienda envía a la fábrica</dt>
          <dd className="mt-1.5 flex flex-wrap items-center gap-2">
            {recepcion.activa ? <Etiqueta tono="musgo">Recepción activa</Etiqueta> : <Etiqueta tono="ambar">Recepción apagada</Etiqueta>}
            <span className="text-tinta-suave">{recepcion.activa ? `Fábrica ${nombrePropio(recepcion.fabrica)}` : "Falta INTEGRACION_TIENDA_SECRETO en la app."}</span>
          </dd>
        </div>
        <div>
          <dt className={dt}>La fábrica envía a la tienda</dt>
          <dd className="mt-1.5 flex flex-wrap items-center gap-2">
            {envio.secretoConfigurado ? <Etiqueta tono="musgo">Lista para firmar</Etiqueta> : <Etiqueta tono="ambar">Sin firma</Etiqueta>}
            <span className="text-tinta-suave">
              {!envio.secretoConfigurado ? "Falta INTEGRACION_TIENDA_SECRETO en la app." : envio.destino ? `Último destino: ${envio.destino}` : "Aún no se ha probado."}
            </span>
          </dd>
        </div>
      </dl>
    </Panel>

    <Panel titulo="Probar la conexión">
      <div className="space-y-4">
        <p className="max-w-2xl text-sm leading-relaxed text-tinta-suave">
          La app firma un PDF de prueba y el servicio de enlace lo entrega a la tienda, que lo mostrará en sus Ajustes. Para probar el otro sentido, aprieta el botón en los Ajustes de la tienda: su PDF aparecerá abajo como «Recibida de la tienda».
        </p>
        <Boton variante="primario" disabled={enCurso || !envio.secretoConfigurado} onClick={() => void enviar()}>
          <Send className="h-4 w-4" /> {enCurso ? "Enviando…" : "Enviar PDF de prueba a la tienda"}
        </Boton>
        <div role="group" aria-label="Resultado de la prueba" aria-live="polite" className="space-y-3">
          {error ? <ErrorAccion error={error} /> : null}
          {prueba && <Resultado p={prueba} lento={lento} />}
        </div>
      </div>
    </Panel>

    <Panel titulo="Últimas pruebas" sinRelleno
      accion={<Boton variante="fantasma" disabled={actualizando} onClick={() => void actualizar()}><RefreshCw className={cn("h-4 w-4", actualizando && "animate-spin motion-reduce:animate-none")} /> Actualizar</Boton>}>
      {pruebas.length === 0 ? <Vacio titulo="Aún no hay pruebas">Aprieta el botón de arriba, o el de la tienda, y aparecerán aquí con su PDF.</Vacio> : (
        <Tabla etiqueta="Últimas pruebas de conexión">
          <thead><tr><Th>Fecha</Th><Th>Sentido</Th><Th>Resultado</Th><Th>Detalle</Th><Th><span className="sr-only">PDF</span></Th></tr></thead>
          <tbody>
            {pruebas.map((p) => {
              const e = ESTADOS[p.estado] ?? { texto: p.estado, tono: "neutro" as const };
              return (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap tabular-nums">{fechaHora(p.creadoEn)}</Td>
                  <Td className="whitespace-nowrap">{p.direccion === "enviada" ? "Enviada a la tienda" : "Recibida de la tienda"}</Td>
                  <Td><Etiqueta tono={e.tono}>{e.texto}</Etiqueta></Td>
                  <Td className="min-w-64 text-tinta-suave">{p.detalle}</Td>
                  <Td className="whitespace-nowrap">
                    <a href={`${RUTA}/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" aria-label={`Ver PDF de la prueba ${p.codigo}`}
                      className="inline-flex min-h-8 items-center gap-1.5 underline underline-offset-2 hover:text-rauli pointer-coarse:min-h-11">
                      <FileText className="h-4 w-4" /> Ver PDF <span className="font-mono text-xs text-tinta-tenue">{p.codigo}</span>
                    </a>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </Panel>
  </div>;
}
