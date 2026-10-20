// Chipax simulado (ADR-0021) para integración y E2E: login, /v2/compras paginado y el XML por URL firmada, con la
// forma que responde la API real de Chipax. Ninguna prueba llama a Chipax real.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dteXml, type FacturaPrueba } from "./dte";

export const CREDENCIALES_PRUEBA = { appId: "app-prueba", secretKey: "secreto-prueba-no-real" };

export interface FacturaSimulada extends FacturaPrueba {
  id: number;
  estado?: "recibido" | "aceptado" | "rechazado";
  anulado?: boolean;
  /** «pendiente» responde 404 xml_not_available; «vencido», 410. */
  xml?: "ok" | "pendiente" | "vencido";
  /** XML a mano (p. ej. con DOCTYPE), en vez del generado. */
  crudo?: string;
}

/** `marcas` las activa una prueba con POST /control/<marca> (p. ej. «la segunda factura ya existe»). */
export interface Control { llamadasCompras: number; forzar429: number; porPagina: number; marcas: Record<string, boolean> }

export async function crearChipaxSimulado(facturas: (control: Control) => FacturaSimulada[], puerto = 0) {
  const control: Control = { llamadasCompras: 0, forzar429: 0, porPagina: 2, marcas: {} };
  let base = "";
  const servidor: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const json = (codigo: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
      void res.writeHead(codigo, { "content-type": "application/json", ...cabeceras }).end(JSON.stringify(cuerpo));
    if (u.pathname === "/health") return void res.writeHead(200).end("ok");
    if (req.method === "POST" && u.pathname.startsWith("/control/")) {
      control.marcas[u.pathname.slice("/control/".length)] = true;
      return json(200, { ok: true });
    }
    if (req.method === "POST" && u.pathname === "/v2/login") {
      let cuerpo = "";
      req.on("data", (c) => { cuerpo += c; });
      req.on("end", () => {
        const d = JSON.parse(cuerpo || "{}");
        if (d.app_id !== CREDENCIALES_PRUEBA.appId || d.secret_key !== CREDENCIALES_PRUEBA.secretKey) return json(400, { message: "Credenciales inválidas" });
        json(200, { message: "ok", token: "jwt-de-prueba", tokenExpiration: new Date(Date.now() + 3_600_000).toISOString(), nombre: "Prueba" });
      });
      return;
    }
    if (req.method === "GET" && u.pathname === "/v2/compras") {
      if (req.headers.authorization !== "JWT jwt-de-prueba") return json(401, { message: "No autorizado" });
      if (control.forzar429 > 0) {
        control.forzar429--;
        return json(429, { code: "RATE_LIMIT", message: "Demasiadas peticiones", retryAfter: 1 }, { "retry-after": "1" });
      }
      control.llamadasCompras++;
      const desde = u.searchParams.get("fechaInicial") ?? "0000-00-00";
      const hasta = u.searchParams.get("fechaFinal") ?? "9999-99-99";
      const todas = facturas(control).filter((f) => f.fecha >= desde && f.fecha <= hasta);
      const pagina = Number(u.searchParams.get("page") ?? 1);
      const items = todas.slice((pagina - 1) * control.porPagina, pagina * control.porPagina).map((f) => ({
        // Como la API real (camelCase, verificado el 14-10-2026), no como el OpenAPI publicado (snake_case).
        id: f.id, tipo: f.tipo, folio: f.folio, rutEmisor: f.rut, razonSocial: f.razon, fechaEmision: f.fecha, estado: f.estado ?? "aceptado",
        anulado: f.anulado ? 1 : null, urlXmlPublica: `${base}/xml?id=${f.id}&type=compra&sig=firma-de-prueba`,
      }));
      return json(200, { items, paginationAttributes: { count: todas.length, totalPages: Math.max(1, Math.ceil(todas.length / control.porPagina)), currentPage: pagina } });
    }
    if (req.method === "GET" && u.pathname === "/xml") {
      if (req.headers.authorization) return json(400, { error: "la URL firmada no lleva Authorization" });
      const f = facturas(control).find((x) => String(x.id) === u.searchParams.get("id"));
      if (!f || f.xml === "pendiente") return json(404, { error: "xml_not_available" });
      if (f.xml === "vencido") return void res.writeHead(410).end();
      const bytes = f.crudo ? Buffer.from(f.crudo, "latin1") : Buffer.from(dteXml(f));
      return void res.writeHead(200, { "content-type": "application/xml" }).end(bytes);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => servidor.listen(puerto, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return { base, api: `${base}/v2`, control, cerrar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
