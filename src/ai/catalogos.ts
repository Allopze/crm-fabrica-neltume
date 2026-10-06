// Catálogos refrescados por el worker; la app solo lee la copia en parametro (REQ-ADM-4.2).
import { apiKeyDesdeEntorno, leerCatalogo, leerConfiguracionPrivada, escribirCatalogo, type CatalogoIA, type LimitesGroq, type ModeloIA, type ProveedorConfigurado } from "./ajustes";

const URL_CMD_MODELOS = "https://api.commandcode.ai/provider/v1/models";
const URL_CMD_PRECIOS = "https://commandcode.ai/docs/resources/pricing-limits";
const URL_GROQ_MODELOS = "https://api.groq.com/openai/v1/models";
const URL_GROQ_LIMITES = "https://console.groq.com/docs/rate-limits";
const HORAS_CACHE = 24;

const esPreview = (id: string) => /preview|experimental|(?:^|[-/:])exp(?:$|[-/:])/i.test(id);
const limpiaHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/")
  .replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ").trim();

function parseLista(valor: unknown): Record<string, unknown>[] {
  if (Array.isArray(valor)) return valor.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  if (valor && typeof valor === "object") {
    const c = valor as { data?: unknown; models?: unknown };
    return parseLista(c.data ?? c.models);
  }
  return [];
}

/** Extrae precios publicados por millón de tokens desde la tabla oficial de Command Code. */
export function parsearPreciosCommandCode(html: string) {
  const precios = new Map<string, { entrada: number; salida: number }>();
  // La página serializa su tabla en React Flight y escapa las comillas del JSON embebido.
  const contenido = html.replace(/\\+"/g, '"');
  const inicios = [...contenido.matchAll(/"id":"([^"\\]+)","name":"([^"\\]+)"/g)];
  for (let i = 0; i < inicios.length; i++) {
    const match = inicios[i];
    const comienzo = (match.index ?? 0) + match[0].length;
    const finSiguiente = inicios[i + 1]?.index ?? comienzo + 4_000;
    const bloque = contenido.slice(comienzo, Math.min(finSiguiente, comienzo + 4_000));
    const entrada = bloque.match(/"inputCost":([0-9]+(?:\.[0-9]+)?)/)?.[1];
    const salida = bloque.match(/"outputCost":([0-9]+(?:\.[0-9]+)?)/)?.[1];
    if (entrada !== undefined && salida !== undefined) precios.set(match[1], { entrada: Number(entrada), salida: Number(salida) });
  }
  return precios;
}

function precioParaModelo(id: string, precios: Map<string, { entrada: number; salida: number }>) {
  const simple = id.split("/").at(-1) ?? id;
  const fila = precios.get(id) ?? precios.get(simple) ?? [...precios.entries()].find(([k]) => simple.endsWith(k))?.[1];
  return fila ? { entrada: fila.entrada, salida: fila.salida } : undefined;
}

function modelosCommandCode(datos: unknown, precios: Map<string, { entrada: number; salida: number }>): ModeloIA[] {
  return parseLista(datos).flatMap((m) => {
    if (typeof m.id !== "string") return [];
    const id = m.id;
    const rutas = Array.isArray(m.supported_endpoints) ? m.supported_endpoints.map(String) : [];
    const precio = precioParaModelo(id, precios);
    const preview = esPreview(id) || /preview|experimental/i.test(String(m.name ?? ""));
    const compatible = rutas.some((x) => /chat\/completions/.test(x)) && Boolean(precio) && !preview;
    const motivo = preview ? "Modelo Preview: no se activa en cotizaciones." : !rutas.some((x) => /chat\/completions/.test(x))
      ? "Este modelo no ofrece Chat Completions, que usa el cotizador."
      : !precio ? "No se encontró su tarifa publicada por millón de tokens." : undefined;
    return [{ id, nombre: typeof m.name === "string" ? m.name : id, compatible, preview, motivo,
      ...(precio ? { precioEntradaUsdMTok: precio.entrada, precioSalidaUsdMTok: precio.salida } : {}) }];
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Convierte la tabla oficial Free; x-ratelimit-* de la API no se usa para inferir RPM. */
export function parsearLimitesGroqFree(html: string): Map<string, LimitesGroq> {
  const limites = new Map<string, LimitesGroq>();
  for (const fila of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celdas = [...fila[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => limpiaHtml(x[1]));
    if (celdas.length < 5 || !/^[\w.-]+\/|^[\w.-]+$/.test(celdas[0])) continue;
    const numero = (x: string) => x === "-" ? undefined : x;
    limites.set(celdas[0], { rpm: numero(celdas[1]), rpd: numero(celdas[2]), tpm: numero(celdas[3]), tpd: numero(celdas[4]) });
  }
  return limites;
}

const MODELOS_CON_HERRAMIENTAS = new Set([
  "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b", "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct", "minimaxai/minimax-m2.7",
]);

function modelosGroq(datos: unknown, limites: Map<string, LimitesGroq>): ModeloIA[] {
  return parseLista(datos).flatMap((m) => {
    if (typeof m.id !== "string") return [];
    const id = m.id;
    const preview = esPreview(id) || /preview|experimental/i.test(String(m.name ?? ""));
    const noChat = (typeof m.type === "string" && m.type !== "chat") || /whisper|orpheus|prompt-guard|compound|embed|speech|transcrib/i.test(id);
    const compatible = !preview && !noChat && (MODELOS_CON_HERRAMIENTAS.has(id) || m.supports_tool_use === true);
    const motivo = preview ? "Preview: Groq recomienda estos modelos solo para evaluación." : noChat
      ? "Este modelo no es compatible con Chat Completions de texto." : !compatible
        ? "No está confirmado el soporte de llamadas de herramienta para este modelo." : undefined;
    return [{ id, nombre: typeof m.name === "string" ? m.name : id, compatible, preview, motivo, limites: limites.get(id) }];
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function texto(url: string, headers?: HeadersInit) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
async function json(url: string, apiKey: string) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function refrescar(proveedor: ProveedorConfigurado, apiKey: string): Promise<CatalogoIA> {
  const actualizadoEn = new Date().toISOString();
  if (proveedor === "commandcode") {
    const [respuesta, html] = await Promise.all([json(URL_CMD_MODELOS, apiKey), texto(URL_CMD_PRECIOS)]);
    return { actualizadoEn, fuente: URL_CMD_PRECIOS, modelos: modelosCommandCode(respuesta, parsearPreciosCommandCode(html)) };
  }
  const [respuesta, html] = await Promise.all([json(URL_GROQ_MODELOS, apiKey), texto(URL_GROQ_LIMITES)]);
  return { actualizadoEn, fuente: URL_GROQ_LIMITES, modelos: modelosGroq(respuesta, parsearLimitesGroqFree(html)) };
}

/** Se invoca desde el worker, nunca desde el request web; una falla conserva el último catálogo válido. */
export async function refrescarCatalogosIA(ahora = Date.now()) {
  const config = await leerConfiguracionPrivada();
  for (const proveedor of ["commandcode", "groq"] as const) {
    const apiKey = apiKeyDesdeEntorno(proveedor);
    if (!apiKey) continue;
    const catalogo = await leerCatalogo(proveedor);
    const edad = catalogo.actualizadoEn ? ahora - Date.parse(catalogo.actualizadoEn) : Infinity;
    if (edad < HORAS_CACHE * 60 * 60_000 && Date.parse(config.actualizadoEn) <= Date.parse(catalogo.actualizadoEn!)) continue;
    try {
      const nuevo = await refrescar(proveedor, apiKey);
      await escribirCatalogo(proveedor, nuevo);
    } catch {
      // No escribir respuesta del proveedor: puede traer detalles operacionales o datos de autenticación.
    }
  }
}
