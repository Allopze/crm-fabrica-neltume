// Catálogos refrescados por el worker; la app solo lee la copia en parametro (REQ-ADM-4.2).
import { apiKeyDesdeEntorno, leerCatalogo, leerConfiguracionPrivada, escribirCatalogo, PROVEEDORES, type CatalogoIA, type ModeloIA } from "./ajustes";

const URL_CMD_MODELOS = "https://api.commandcode.ai/provider/v1/models";
const URL_CMD_PRECIOS = "https://commandcode.ai/docs/resources/pricing-limits";
const HORAS_CACHE = 24;

const esPreview = (id: string) => /preview|experimental|(?:^|[-/:])exp(?:$|[-/:])/i.test(id);

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
    const input = bloque.match(/"inputCost":([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? bloque.match(/"rates":\{"input":([0-9]+(?:\.[0-9]+)?)/)?.[1];
    const output = bloque.match(/"outputCost":([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? bloque.match(/"rates":\{"input":[0-9]+(?:\.[0-9]+)?,"output":([0-9]+(?:\.[0-9]+)?)/)?.[1];
    if (input !== undefined && output !== undefined) precios.set(match[1], { entrada: Number(input), salida: Number(output) });
  }
  return precios;
}

export function precioParaModelo(id: string, precios: Map<string, { entrada: number; salida: number }>) {
  const simple = id.split("/").at(-1) ?? id;
  const normalizar = (valor: string) => valor.toLowerCase().replace(/[^a-z0-9]/g, "");
  const claveSimple = normalizar(simple);
  const equivalentes = [...precios.entries()].filter(([clave]) => normalizar(clave) === claveSimple);
  const versionFechada = [...precios.entries()].filter(([clave]) => claveSimple.startsWith(normalizar(clave)));
  const alias = equivalentes.length === 1 ? equivalentes[0]?.[1]
    : versionFechada.length === 1 ? versionFechada[0]?.[1] : undefined;
  const fila = precios.get(id) ?? precios.get(simple) ?? alias;
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

/** Catálogo autenticado de Command Code cruzado con sus tarifas publicadas por millón de tokens. */
async function refrescar(apiKey: string): Promise<CatalogoIA> {
  const [respuesta, html] = await Promise.all([json(URL_CMD_MODELOS, apiKey), texto(URL_CMD_PRECIOS)]);
  return { actualizadoEn: new Date().toISOString(), fuente: URL_CMD_PRECIOS, modelos: modelosCommandCode(respuesta, parsearPreciosCommandCode(html)) };
}

/** Se invoca desde el worker, nunca desde el request web; una falla conserva el último catálogo válido. */
export async function refrescarCatalogosIA(ahora = Date.now()) {
  const config = await leerConfiguracionPrivada();
  for (const proveedor of PROVEEDORES) {
    const apiKey = apiKeyDesdeEntorno(proveedor);
    if (!apiKey) continue;
    const catalogo = await leerCatalogo(proveedor);
    const edad = catalogo.actualizadoEn ? ahora - Date.parse(catalogo.actualizadoEn) : Infinity;
    if (edad < HORAS_CACHE * 60 * 60_000 && Date.parse(config.actualizadoEn) <= Date.parse(catalogo.actualizadoEn!)) continue;
    try {
      const nuevo = await refrescar(apiKey);
      await escribirCatalogo(proveedor, nuevo);
    } catch {
      // No escribir respuesta del proveedor: puede traer detalles operacionales o datos de autenticación.
    }
  }
}
