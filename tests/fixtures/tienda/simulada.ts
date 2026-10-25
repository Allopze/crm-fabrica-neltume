// Tienda simulada (ADR-0024) para integración y E2E: recibe `connection.test` como la ruta real de la tienda (firma HMAC
// sobre los bytes crudos, ventana, esquema y clave de idempotencia) y responde según el `modo` que fije la prueba, también
// los fallos que el diagnóstico debe explicar. Ninguna prueba llama a la tienda real.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { clavePrueba, mensajePruebaEnviada, ORIGEN_FABRICA, RUTA_PRUEBAS } from "@/domain/integracion-tienda/conexion";
import { verificarFirma } from "@/domain/integracion-tienda/firma";
import { SECRETO_PRUEBA } from "./constantes";

export type ModoTienda =
  | "ok" | "duplicado" | "reloj" // 201 / 200 duplicate / 201 con el reloj adelantado 5 min
  | "400" | "401" | "403" | "404" | "405" | "409" | "413" | "415" | "422" | "429" | "500" | "503" // errores
  | "redireccion" | "colgar" // 302 / no contesta a tiempo
  | "otra_app" | "otro_evento" | "ilegible" | "enorme" // 2xx que no es la confirmación de la tienda
  | "cuerpo_lento" | "cuerpo_cortado" // 201 cuyo cuerpo no termina de llegar: se cuelga o la conexión se corta
  | "reloj_absurdo" | "codigo_raro"; // datos que no caben en la BD: un receivedAt del año 2099, un error.code con NUL

export interface Recibida {
  cuerpo: Buffer; cabeceras: Record<string, string | string[] | undefined>; firmaValida: boolean;
  mensaje: ReturnType<typeof mensajePruebaEnviada.parse> | null;
}
export interface ControlTienda { modo: ModoTienda; retrasoMs: number; peticiones: number; recibidas: Recibida[] }

export async function crearTiendaSimulada(opciones: { puerto?: number; secreto?: string } = {}) {
  const secreto = opciones.secreto ?? SECRETO_PRUEBA;
  const control: ControlTienda = { modo: "ok", retrasoMs: 0, peticiones: 0, recibidas: [] };
  const servidor: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const json = (codigo: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
      void res.writeHead(codigo, { "content-type": "application/json", ...cabeceras }).end(JSON.stringify(cuerpo));
    const leer = (despues: (cuerpo: Buffer) => void) => {
      const trozos: Buffer[] = [];
      req.on("data", (c: Buffer) => trozos.push(c));
      req.on("end", () => despues(Buffer.concat(trozos)));
    };
    if (u.pathname === "/health") return void res.writeHead(200).end("ok");
    // Lo que una prueba E2E necesita para dirigir y consultar la tienda sin tocar el proceso.
    if (u.pathname === "/control") {
      if (req.method === "POST") {
        return leer((cuerpo) => {
          const c = JSON.parse(cuerpo.toString("utf8") || "{}") as { modo?: ModoTienda; retrasoMs?: number; reiniciar?: boolean };
          if (c.modo) control.modo = c.modo;
          if (c.retrasoMs !== undefined) control.retrasoMs = c.retrasoMs;
          if (c.reiniciar) { control.recibidas = []; control.peticiones = 0; control.modo = "ok"; control.retrasoMs = 0; }
          json(200, { ok: true });
        });
      }
      return json(200, {
        modo: control.modo, peticiones: control.peticiones,
        recibidas: control.recibidas.map((r) => ({
          firmaValida: r.firmaValida, bytes: r.cuerpo.length, eventId: r.mensaje?.eventId ?? null, source: r.mensaje?.source ?? null, factoryCode: r.mensaje?.factoryCode ?? null,
          pdfValido: r.mensaje ? Buffer.from(r.mensaje.document.contentBase64, "base64").subarray(0, 5).toString("latin1") === "%PDF-" : false,
          clave: r.cabeceras["x-idempotency-key"] ?? null,
        })),
      });
    }
    if (u.pathname !== RUTA_PRUEBAS) return void res.writeHead(404).end();
    if (req.method !== "POST") return void res.writeHead(405, { allow: "POST" }).end();
    leer((cuerpo) => {
      control.peticiones++;
      const cab = req.headers;
      const un = (k: string) => (Array.isArray(cab[k]) ? cab[k][0] : cab[k]) ?? null;
      const firmaValida = verificarFirma([secreto], { timestamp: un("x-neltume-timestamp"), firma: un("x-neltume-signature") }, cuerpo).ok;
      let mensaje: Recibida["mensaje"] = null;
      try { mensaje = mensajePruebaEnviada.parse(JSON.parse(cuerpo.toString("utf8"))); } catch { /* el modo «ok» lo rechaza */ }
      control.recibidas.push({ cuerpo, cabeceras: cab, firmaValida, mensaje });
      const confirmar = (http: number, status: "accepted" | "duplicate", extra: Partial<{ eventId: string; receiver: string; receivedAt: string }> = {}) =>
        json(http, { status, eventId: mensaje?.eventId, receiver: "neltume-store", receivedAt: new Date().toISOString(), ...extra });
      const error = (http: number, code: string, cabeceras: Record<string, string> = {}) => json(http, { error: { code, message: `simulado: ${code}` } }, cabeceras);
      const responder = () => {
        switch (control.modo) {
          case "ok": case "duplicado": case "reloj":
            if (!firmaValida) return error(401, "invalid_signature");
            if (!mensaje) return error(400, "schema_invalid");
            if (un("x-idempotency-key") !== clavePrueba(ORIGEN_FABRICA, mensaje.eventId)) return error(400, "schema_invalid");
            return confirmar(control.modo === "duplicado" ? 200 : 201, control.modo === "duplicado" ? "duplicate" : "accepted",
              control.modo === "reloj" ? { receivedAt: new Date(Date.now() + 5 * 60_000).toISOString() } : {});
          case "400": return error(400, "schema_invalid");
          case "401": return error(401, "invalid_signature");
          case "403": return void res.writeHead(403, { "content-type": "text/html" }).end("<h1>Forbidden</h1>");
          case "404": return void res.writeHead(404, { "content-type": "text/html" }).end("<h1>No encontrado</h1>");
          case "405": return void res.writeHead(405, { allow: "GET" }).end();
          case "409": return error(409, "idempotency_conflict");
          case "413": return error(413, "payload_too_large");
          case "415": return error(415, "unsupported_media_type");
          case "422": return error(422, "document_invalid");
          case "429": return error(429, "rate_limited", { "retry-after": "5" });
          case "500": return void res.writeHead(500, { "content-type": "text/plain" }).end("boom");
          case "503": return error(503, "not_configured", { "retry-after": "600" });
          case "redireccion": return void res.writeHead(302, { location: "https://login.invalid/acceso" }).end();
          case "colgar": return; // no contesta: el emisor se rinde por plazo
          case "otra_app": return confirmar(201, "accepted", { receiver: "neltume-factory" });
          case "otro_evento": return confirmar(201, "accepted", { eventId: "00000000-0000-4000-8000-000000000000" });
          case "ilegible": return void res.writeHead(200, { "content-type": "text/html" }).end("<html>no soy la tienda</html>");
          case "enorme": return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ relleno: "x".repeat(200_000) }));
          case "reloj_absurdo": return confirmar(201, "accepted", { receivedAt: "2099-01-01T00:00:00.000Z" });
          case "codigo_raro": return void res.writeHead(422, { "content-type": "application/json" }).end('{"error":{"code":"a\\u0000b","message":"x\\u0000y"}}');
          case "cuerpo_lento": case "cuerpo_cortado": {
            // Promete 1.000 bytes de cuerpo y manda 12: o se queda esperando, o corta la conexión.
            res.writeHead(201, { "content-type": "application/json", "content-length": "1000" });
            res.write('{"status":"a');
            if (control.modo === "cuerpo_cortado") setTimeout(() => res.destroy(), 100);
            return;
          }
        }
      };
      if (control.retrasoMs > 0) setTimeout(responder, control.retrasoMs); else responder();
    });
  });
  await new Promise<void>((ok) => servidor.listen(opciones.puerto ?? 0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return {
    base, control,
    cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections(); servidor.close(() => ok()); }),
  };
}
