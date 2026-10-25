// Diagnóstico de un envío de prueba a la tienda (contrato §6, ADR-0024): del resultado de la llamada al texto que lee la
// persona. Puro, para probarlo sin red. Los textos son los acordados con la tienda, con «la tienda» en vez de «la otra
// app» (la Fase 20 cambiará el nombre visible en un solo lugar: `TIENDA`).
import { z } from "zod";
import { numero } from "@/lib/formato";
import { AVISO_RELOJ_MS } from "./conexion";

const TIENDA = "la tienda";
const MAX_DETALLE = 300;
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export type EstadoEnvio = "aceptada" | "duplicada" | "rechazada" | "sin_respuesta" | "no_configurada" | "vencida";

export interface ResultadoEnvio {
  estado: EstadoEnvio;
  httpStatus: number | null;
  codigoError: string | null;
  detalle: string;
  latenciaMs: number | null;
  desfaseRelojMs: number | null;
}

const recortar = (t: string) => t.length > MAX_DETALLE ? `${t.slice(0, MAX_DETALLE - 1)}…` : t;
/** Lo que escribe la tienda va a una columna `text` y a la pantalla: sin caracteres de control (un NUL rompería el UPDATE). */
const limpiar = (t: string) => t.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
/** Un `error.code` del contrato es un identificador; cualquier otra cosa se descarta. */
const CODIGO = /^[A-Za-z0-9_.:-]{1,80}$/;
/** `desfase_reloj_ms` es un integer de 32 bits: un `receivedAt` absurdo (el año 2099) se acota, no se guarda tal cual. */
const MAX_DESFASE_MS = 2_000_000_000;
const sinRespuesta = (codigoError: string, detalle: string): ResultadoEnvio =>
  ({ estado: "sin_respuesta", httpStatus: null, codigoError, detalle: recortar(detalle), latenciaMs: null, desfaseRelojMs: null });

/** Lo que se sabe del fallo de `fetch` (Node/undici), sin darle a la persona un mensaje técnico crudo. */
export type FalloDeRed = { tipo: "plazo"; ms: number } | { tipo: "redireccion" } | { tipo: "dns" } | { tipo: "rechazada" } | { tipo: "tls" } | { tipo: "otro"; mensaje: string };

export function clasificarFalloDeRed(e: unknown, plazoMs: number): FalloDeRed {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { tipo: "plazo", ms: plazoMs };
  const causa = e instanceof Error ? (e.cause as { message?: string; code?: string; errors?: { code?: string }[] } | undefined) : undefined;
  // Una conexión a un host con varias direcciones falla con un AggregateError: sin mensaje y con el código en sus errores internos.
  const codigo = causa?.code || causa?.errors?.find((x) => x?.code)?.code || "";
  const mensaje = causa?.message || (e instanceof Error ? e.message : String(e));
  // `redirect: "error"`: undici falla con «unexpected redirect» (p. ej. el login de Cloudflare Access).
  if (/unexpected redirect/i.test(mensaje)) return { tipo: "redireccion" };
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return { tipo: "dns" };
  if (codigo === "ECONNREFUSED") return { tipo: "rechazada" };
  if (/^(ERR_SSL|ERR_TLS|CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|HOSTNAME_MISMATCH)/.test(codigo)) return { tipo: "tls" };
  if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(codigo)) return { tipo: "otro", mensaje: "se agotó el plazo de conexión" };
  if (["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(codigo)) return { tipo: "otro", mensaje: "la tienda tardó demasiado en contestar" };
  if (["ENETUNREACH", "EHOSTUNREACH"].includes(codigo)) return { tipo: "otro", mensaje: "no hay ruta hacia el servidor" };
  if (["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(codigo)) return { tipo: "otro", mensaje: "la conexión se cortó" };
  return { tipo: "otro", mensaje: limpiar(mensaje || codigo || (e instanceof Error ? e.name : "error de red")).slice(0, 120) };
}

export function diagnosticarFalloDeRed(f: FalloDeRed): ResultadoEnvio {
  switch (f.tipo) {
    case "plazo": return sinRespuesta("timeout", `No se pudo conectar con ${TIENDA}: sin respuesta en ${numero(f.ms)} ms`);
    case "redireccion": return sinRespuesta("redirect", "No se pudo conectar: redirección inesperada (¿Cloudflare Access?)");
    case "dns": return sinRespuesta("dns", `No se pudo conectar con ${TIENDA}: no se encontró el servidor (DNS)`);
    case "rechazada": return sinRespuesta("connection_refused", `No se pudo conectar con ${TIENDA}: conexión rechazada`);
    case "tls": return sinRespuesta("tls", `No se pudo conectar con ${TIENDA}: certificado o conexión segura inválidos`);
    case "otro": return sinRespuesta("network", `No se pudo conectar con ${TIENDA}: ${f.mensaje}`);
  }
}

/** Falta `ENLACE_TIENDA_URL` (o no es una URL permitida): el servicio ni intenta la llamada. */
export const sinUrl = (motivo: string): ResultadoEnvio =>
  ({ estado: "no_configurada", httpStatus: null, codigoError: "no_configurada", detalle: recortar(motivo), latenciaMs: null, desfaseRelojMs: null });

export const FIRMA_VENCIDA: ResultadoEnvio = {
  estado: "vencida", httpStatus: null, codigoError: "vencida", latenciaMs: null, desfaseRelojMs: null,
  detalle: "La firma tenía más de 4 minutos cuando el servicio de enlace pudo tomarla, así que no se envió. Vuelve a probar.",
};
export const ENVIO_INTERRUMPIDO: ResultadoEnvio = {
  estado: "sin_respuesta", httpStatus: null, codigoError: "interrumpida", latenciaMs: null, desfaseRelojMs: null,
  detalle: `El servicio de enlace se detuvo antes de recibir la respuesta: no se sabe si ${TIENDA} la recibió.`,
};

const confirmacion = z.object({ status: z.enum(["accepted", "duplicate"]), eventId: z.string(), receiver: z.string(), receivedAt: z.string().optional() });
const errorTienda = z.object({ error: z.object({ code: z.string().max(80), message: z.string().max(500).optional() }) });
const leerJson = (texto: string): unknown => { try { return JSON.parse(texto); } catch { return null; } };

/** `inicioMs` y `finMs`: el reloj de la fábrica al enviar y al recibir la respuesta (la latencia y el desfase salen de ahí). */
export interface Respuesta { status: number; texto: string; eventId: string; inicioMs: number; finMs: number }

export function diagnosticarRespuesta(r: Respuesta): ResultadoEnvio {
  const latenciaMs = Math.max(0, r.finMs - r.inicioMs);
  const base = { httpStatus: r.status, latenciaMs, desfaseRelojMs: null as number | null };
  const json = leerJson(r.texto);

  if (r.status >= 200 && r.status < 300) {
    const ok = confirmacion.safeParse(json);
    // La tienda tiene que contestar con su identidad y el mismo evento: otra cosa es otra app en esa URL.
    if (!ok.success || ok.data.receiver !== "neltume-store" || ok.data.eventId !== r.eventId) {
      return { ...base, estado: "rechazada", codigoError: "otra_aplicacion", detalle: "Respondió otra aplicación" };
    }
    const recibida = ok.data.receivedAt ? Date.parse(ok.data.receivedAt) : NaN;
    // Reloj de la tienda menos el nuestro, tomando el punto medio del viaje para no culpar a la latencia.
    const desfaseRelojMs = Number.isFinite(recibida) ? Math.max(-MAX_DESFASE_MS, Math.min(MAX_DESFASE_MS, Math.round(recibida - (r.inicioMs + r.finMs) / 2))) : null;
    const aviso = desfaseRelojMs !== null && Math.abs(desfaseRelojMs) > AVISO_RELOJ_MS
      ? ` Aviso: el reloj de ${TIENDA} difiere ${numero(Math.round(Math.abs(desfaseRelojMs) / 1000))} s del nuestro y la firma solo vale ±300 s.` : "";
    const duplicada = ok.data.status === "duplicate";
    return { ...base, desfaseRelojMs, estado: duplicada ? "duplicada" : "aceptada", codigoError: null,
      detalle: recortar(`${duplicada ? `Aceptada en ${numero(latenciaMs)} ms (${TIENDA} ya la tenía).` : `Aceptada en ${numero(latenciaMs)} ms.`}${aviso}`) };
  }

  const e = errorTienda.safeParse(json);
  const codigo = e.success && CODIGO.test(e.data.error.code) ? e.data.error.code : null;
  const mensaje = (e.success && e.data.error.message ? limpiar(e.data.error.message) : "") || undefined;
  const rechazo = (codigoError: string, detalle: string): ResultadoEnvio => ({ ...base, estado: "rechazada", codigoError, detalle: recortar(detalle) });
  switch (r.status) {
    case 401: return rechazo(codigo ?? "invalid_signature", `${capital(TIENDA)} rechazó la firma: el secreto no coincide o los relojes difieren en más de 5 minutos`);
    case 403: return rechazo(codigo ?? "forbidden", `${capital(TIENDA)} rechazó el acceso (403): revisa el Host permitido o el acceso por Cloudflare`);
    case 404: case 405: return rechazo(codigo ?? (r.status === 404 ? "not_found" : "method_not_allowed"), `${capital(TIENDA)} aún no tiene esta ruta (versión sin desplegar)`);
    case 503:
      if (codigo === "not_configured") return rechazo(codigo, `${capital(TIENDA)} no tiene configurada la integración`);
      break;
    case 400: case 409: case 413: case 415: case 422:
      return rechazo(codigo ?? `http_${r.status}`, `${capital(TIENDA)} rechazó la prueba (${r.status}): ${codigo ?? "sin código"}${mensaje ? ` — ${mensaje}` : ""}`);
  }
  return rechazo(codigo ?? `http_${r.status}`, `${capital(TIENDA)} respondió ${r.status}`);
}
