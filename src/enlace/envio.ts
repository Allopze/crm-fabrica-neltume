// Envío de una prueba de conexión a la tienda (ADR-0024 §3, contrato §5). Reenvía los bytes que la app ya firmó, solo a
// `ENLACE_TIENDA_URL` y a la ruta fija del contrato: nada de lo que traiga la fila cambia el destino ni las cabeceras. No
// conoce el secreto de la integración. Un intento, con plazo, sin seguir redirecciones y con la respuesta acotada.
import { z } from "zod";
import { MAX_RESPUESTA_BYTES, PLAZO_ENVIO_MS, RUTA_PRUEBAS } from "@/domain/integracion-tienda/conexion";
import { clasificarFalloDeRed, diagnosticarFalloDeRed, diagnosticarRespuesta, type ResultadoEnvio, sinUrl } from "@/domain/integracion-tienda/diagnostico";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface ConfigEnlace {
  /** Origen de la tienda, o null si falta o no es una URL permitida (`motivoSinUrl` dice por qué). */
  url: string | null;
  motivoSinUrl: string | null;
  timeoutMs: number;
}

/**
 * `ENLACE_TIENDA_URL` es solo el origen de la tienda: HTTPS (HTTP únicamente para localhost, 127.0.0.1 y [::1], en
 * desarrollo) y sin usuario, clave, ruta, parámetros ni fragmento. `ENLACE_TIENDA_TIMEOUT_MS`: 1.000–60.000 (15.000 por omisión).
 */
export function configEnlace(env: NodeJS.ProcessEnv = process.env): ConfigEnlace {
  const plazo = Number(env.ENLACE_TIENDA_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(plazo) && plazo > 0 ? Math.min(60_000, Math.max(1_000, Math.round(plazo))) : PLAZO_ENVIO_MS;
  const sin = (motivoSinUrl: string): ConfigEnlace => ({ url: null, motivoSinUrl, timeoutMs });
  const texto = env.ENLACE_TIENDA_URL?.trim() ?? "";
  if (!texto) return sin("Falta configurar ENLACE_TIENDA_URL en el servicio de enlace.");
  if (!URL.canParse(texto)) return sin("ENLACE_TIENDA_URL no es una URL válida.");
  const u = new URL(texto);
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/") return sin("ENLACE_TIENDA_URL debe ser solo el origen de la tienda, sin usuario, ruta ni parámetros.");
  if (!(u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname)))) return sin("ENLACE_TIENDA_URL debe ser https (http solo para localhost).");
  return { url: u.origin, motivoSinUrl: null, timeoutMs };
}

/** Las únicas cabeceras que se reenvían, con su forma validada: la fila de la BD no puede agregar otras. */
const cabeceras = z.object({ "x-neltume-timestamp": z.string(), "x-neltume-signature": z.string(), "x-idempotency-key": z.string() });

export interface PruebaPendiente { id: string; eventId: string; solicitud: Buffer; cabeceras: unknown }
export type ResultadoConDestino = ResultadoEnvio & { destino: string | null };

/** Lee la respuesta hasta 64 KB: una tienda mal configurada no llena la memoria. */
async function leerRespuesta(res: Response): Promise<string> {
  const lector = res.body?.getReader();
  if (!lector) return "";
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAX_RESPUESTA_BYTES) {
      await lector.cancel().catch(() => undefined);
      break;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}

export async function enviarPrueba(
  cfg: ConfigEnlace, p: PruebaPendiente, deps: { fetch?: typeof fetch; ahora?: () => number } = {},
): Promise<ResultadoConDestino> {
  if (!cfg.url) return { ...sinUrl(cfg.motivoSinUrl ?? "Falta configurar ENLACE_TIENDA_URL en el servicio de enlace."), destino: null };
  const destino = new URL(cfg.url).host;
  const ahora = deps.ahora ?? Date.now;
  const firmadas = cabeceras.safeParse(p.cabeceras);
  if (!firmadas.success) {
    return { ...diagnosticarFalloDeRed({ tipo: "otro", mensaje: "la solicitud guardada no trae las cabeceras de la firma" }), destino };
  }
  const inicioMs = ahora();
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`${cfg.url}${RUTA_PRUEBAS}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "neltume-fabrica", ...firmadas.data },
      body: new Uint8Array(p.solicitud),
      redirect: "error",
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    return { ...diagnosticarFalloDeRed(clasificarFalloDeRed(e, cfg.timeoutMs)), destino };
  }
  // Un 2xx cuyo cuerpo no termina de llegar (se cuelga hasta el plazo o se corta) es un fallo de red, no «otra aplicación».
  // En un error, en cambio, manda el estado: un cuerpo ilegible no cambia lo que dijo la tienda.
  let texto = "";
  try {
    texto = await leerRespuesta(res);
  } catch (e) {
    if (res.status >= 200 && res.status < 300) return { ...diagnosticarFalloDeRed(clasificarFalloDeRed(e, cfg.timeoutMs)), destino };
  }
  return { ...diagnosticarRespuesta({ status: res.status, texto, eventId: p.eventId, inicioMs, finMs: ahora() }), destino };
}
