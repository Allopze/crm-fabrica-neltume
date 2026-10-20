// Cliente de la API v2 de Chipax (ADR-0021): único lugar que habla con Chipax. El token y las URL firmadas del XML
// solo viven en memoria: nunca se registran ni se guardan. Respeta el límite de peticiones (un GET con filtros cada
// 5 s por endpoint) y `Retry-After` ante 429. Formato de la API verificado con credenciales reales el 14-10-2026.
import { MAX_XML_BYTES } from "./dte";

/** Cabecera de una factura de compra, ya normalizada (la API real responde en camelCase; el OpenAPI, en snake_case). */
export interface CompraChipax {
  id: number | null; tipo: number; folio: number; rutEmisor: string; razonSocial: string; fechaEmision: string;
  estado: string | null; anulada: boolean; urlXmlPublica: string | null;
}

const verdadero = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

/** Acepta los nombres reales (camelCase, verificados el 14-10-2026) y los del OpenAPI publicado (snake_case). */
export function normalizarCompra(c: Record<string, unknown>): CompraChipax {
  const texto = (...ks: string[]) => { for (const k of ks) if (c[k] !== undefined && c[k] !== null) return String(c[k]); return ""; };
  return {
    id: Number.isFinite(Number(c.id)) ? Number(c.id) : null,
    tipo: Number(c.tipo), folio: Number(c.folio),
    rutEmisor: texto("rutEmisor", "rut_emisor"), razonSocial: texto("razonSocial", "razon_social").trim(),
    fechaEmision: texto("fechaEmision", "fecha_emision").slice(0, 10),
    estado: texto("estado") || null,
    anulada: verdadero(c.anulado) || verdadero(c.deleted),
    urlXmlPublica: texto("urlXmlPublica") || null,
  };
}
export type ResultadoXml = { estado: "ok"; bytes: Uint8Array } | { estado: "pendiente" } | { estado: "vencido" };

export interface ClienteChipax {
  compras(desde: string, hasta: string): AsyncGenerator<CompraChipax>;
  xml(url: string | null | undefined): Promise<ResultadoXml>;
}

export interface OpcionesChipax {
  appId: string; secretKey: string;
  base?: string; esperaMs?: number; timeoutMs?: number;
  /** Dominios desde los que se acepta descargar el XML (y sus subdominios). */
  hostsXml?: string[];
  dormir?: (ms: number) => Promise<void>;
}

/** Error con mensaje seguro de mostrar: nunca lleva el token, la clave ni la URL firmada. */
export class ErrorChipax extends Error {}

const MAX_PAGINAS = 50;
const MAX_REINTENTOS_429 = 3;

/** Vencimiento del token: Chipax lo informa como fecha o como época (s o ms); sin dato, 50 min. */
function vencimiento(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const fecha = typeof valor === "string" ? Date.parse(valor) : NaN;
  return Number.isFinite(fecha) ? fecha : Date.now() + 50 * 60_000;
}

export function clienteChipax(o: OpcionesChipax): ClienteChipax {
  const base = (o.base ?? "https://api.chipax.com/v2").replace(/\/+$/, "");
  const espera = o.esperaMs ?? 5_500;
  const timeout = o.timeoutMs ?? 20_000;
  const hosts = (o.hostsXml ?? ["chipax.com"]).map((h) => h.toLowerCase());
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let token: string | null = null;
  let venceEn = 0;
  let ultimaLista = 0;

  async function login(): Promise<string> {
    const r = await fetch(`${base}/login`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({ app_id: o.appId, secret_key: o.secretKey }),
    }).catch(() => { throw new ErrorChipax("No se pudo conectar con Chipax."); });
    if (!r.ok) throw new ErrorChipax(r.status === 400 || r.status === 401 ? "Chipax rechazó las credenciales (app_id y secret_key)." : `Chipax respondió ${r.status} al iniciar sesión.`);
    const cuerpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const t = cuerpo.token ?? cuerpo.access_token ?? cuerpo.jwt;
    if (typeof t !== "string" || !t) throw new ErrorChipax("Chipax no devolvió un token.");
    token = t;
    venceEn = vencimiento(cuerpo.tokenExpiration);
    return t;
  }

  async function autorizado(): Promise<string> {
    return token && Date.now() < venceEn - 60_000 ? token : login();
  }

  /** GET de la API con espera entre peticiones, `Retry-After` ante 429 y un nuevo login si el token venció. */
  async function obtener(ruta: string, consulta: Record<string, string>): Promise<unknown> {
    let reintentos = 0;
    let relogin = false;
    for (;;) {
      const falta = ultimaLista + espera - Date.now();
      if (falta > 0) await dormir(falta);
      ultimaLista = Date.now();
      const r = await fetch(`${base}${ruta}?${new URLSearchParams(consulta)}`, {
        headers: { authorization: `JWT ${await autorizado()}` }, signal: AbortSignal.timeout(timeout),
      }).catch(() => { throw new ErrorChipax(`No se pudo conectar con Chipax (${ruta}).`); });
      if (r.status === 429 && reintentos < MAX_REINTENTOS_429) {
        reintentos++;
        const cuerpo = (await r.json().catch(() => ({}))) as { retryAfter?: number };
        const segundos = Number(r.headers.get("retry-after") ?? cuerpo.retryAfter ?? 10);
        await dormir(Math.min(Math.max(Number.isFinite(segundos) ? segundos : 10, 1), 60) * 1000);
        continue;
      }
      if (r.status === 401 && !relogin) {
        relogin = true;
        token = null;
        continue;
      }
      if (!r.ok) throw new ErrorChipax(`Chipax respondió ${r.status} en ${ruta}.`);
      return r.json();
    }
  }

  return {
    async *compras(desde, hasta) {
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        // Sin `conXml=true`: en la API real devuelve 0 aunque el XML exista (14-10-2026). Un XML que aún no está
        // responde 404 y se reintenta en la próxima corrida.
        const r = await obtener("/compras", { fechaInicial: desde, fechaFinal: hasta, page: String(pagina) }) as
          Record<string, unknown>[] | { items?: Record<string, unknown>[]; paginationAttributes?: { totalPages?: number } };
        const items = Array.isArray(r) ? r : r.items ?? [];
        for (const c of items) yield normalizarCompra(c);
        const total = Array.isArray(r) ? 1 : Number(r.paginationAttributes?.totalPages ?? 1);
        if (!items.length || pagina >= total) return;
      }
    },

    async xml(url) {
      if (!url) return { estado: "pendiente" };
      let u: URL;
      try { u = new URL(url); } catch { throw new ErrorChipax("La URL del XML no es válida."); }
      const host = u.hostname.toLowerCase();
      const local = host === "127.0.0.1" || host === "localhost";
      if (!hosts.some((h) => host === h || host.endsWith(`.${h}`)) || (u.protocol !== "https:" && !(local && u.protocol === "http:"))) {
        throw new ErrorChipax("La URL del XML no es de Chipax: no se descarga.");
      }
      // La firma de la URL es la autorización: no se envía el token.
      const r = await fetch(u, { signal: AbortSignal.timeout(timeout), redirect: "error" })
        .catch(() => { throw new ErrorChipax("No se pudo descargar el XML de Chipax."); });
      if (r.status === 404) return { estado: "pendiente" };
      if (r.status === 410) return { estado: "vencido" };
      if (!r.ok) throw new ErrorChipax(`Chipax respondió ${r.status} al descargar un XML.`);
      if (Number(r.headers.get("content-length") ?? 0) > MAX_XML_BYTES) throw new ErrorChipax("El XML supera el tamaño máximo.");
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength > MAX_XML_BYTES) throw new ErrorChipax("El XML supera el tamaño máximo.");
      return { estado: "ok", bytes };
    },
  };
}
