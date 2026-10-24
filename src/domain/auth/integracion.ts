// Tercera envoltura de rutas, junto a `conPermiso` y `publico` (ADR-0023 §1): solo para la API de la tienda bajo
// src/app/api/integrations/** (lo exige el test estructural). Sin sesión, cookies ni CSRF: la única credencial es la
// firma HMAC, verificada sobre los bytes crudos antes de interpretar nada. Errores en el formato del contrato:
// `{ error: { code, message } }` (contrato §5), nunca con datos del pedido ni secretos.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { bd } from "@/db/conexion";
import { registro } from "@/lib/registro";
import { registrarAuditoria, registrarDenegacionAnonima } from "../auditoria";
import { type ConfigIntegracion, configIntegracion, verificarFirma } from "../integracion-tienda/firma";
import { DocumentoInvalido } from "../integracion-tienda/documentos";
import { ErrorIntegracion } from "../integracion-tienda/nota";
import { acotarCuerpo } from "./politica";

export interface ContextoIntegracion<P> {
  req: NextRequest; params: P; cuerpo: Uint8Array; config: ConfigIntegracion; correlacionId: string; ip?: string;
  /** Tipo del cuerpo sin parámetros (`application/json`, `image/png`…). */
  tipo: string;
}

export function errorIntegracion(http: number, code: string, message: string, correlacionId: string, cabeceras: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message }, correlationId: correlacionId }, { status: http, headers: { "x-correlacion-id": correlacionId, ...cabeceras } });
}

export function integracion<P = Record<string, never>>(
  manejador: (ctx: ContextoIntegracion<P>) => Promise<Response>, opciones: { maxCuerpo: number; tipos: readonly string[] },
): (req: NextRequest, segmento: { params: Promise<P> }) => Promise<Response> {
  return async (peticion, segmento) => {
    const correlacionId = randomUUID();
    const ip = peticion.headers.get("cf-connecting-ip") ?? peticion.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const ruta = `${peticion.method} ${peticion.nextUrl.pathname}`;
    const acotada = await acotarCuerpo(peticion, opciones.maxCuerpo, correlacionId);
    if (acotada instanceof NextResponse) {
      return acotada.status === 413
        ? errorIntegracion(413, "payload_too_large", `El envío supera ${Math.round(opciones.maxCuerpo / 1024 / 1024)} MB.`, correlacionId)
        : errorIntegracion(400, "schema_invalid", "Content-Length inválido.", correlacionId);
    }
    const tipo = acotada.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!opciones.tipos.includes(tipo)) return errorIntegracion(415, "unsupported_media_type", `Content-Type no admitido: se espera ${opciones.tipos.join(", ")}.`, correlacionId);
    const config = configIntegracion();
    if (!config) return errorIntegracion(503, "not_configured", "La integración con la tienda no está configurada en la fábrica.", correlacionId, { "retry-after": "600" });

    const cuerpo = new Uint8Array(await acotada.arrayBuffer());
    const firma = verificarFirma(config.secretos, { timestamp: acotada.headers.get("x-neltume-timestamp"), firma: acotada.headers.get("x-neltume-signature") }, cuerpo);
    if (!firma.ok) {
      // Sin secretos, firma ni cuerpo: solo el motivo. En audit_log, agregada por IP cada 15 min (ADR-0016).
      registro.warn("integración de la tienda: firma rechazada", { motivo: firma.motivo, ruta, ip, correlacion_id: correlacionId });
      await registrarDenegacionAnonima(bd(), { actor: { tipo: "visitante", ip, userAgent: acotada.headers.get("user-agent") ?? undefined }, accion: ruta, recurso: "integracion",
        motivo: "FIRMA_INVALIDA", despues: { detalle: firma.motivo }, origen: "api", correlacionId });
      return errorIntegracion(401, "invalid_signature", "Firma o timestamp inválidos.", correlacionId);
    }

    try {
      const r = await manejador({ req: acotada, params: await segmento.params, cuerpo, config, correlacionId, ip, tipo });
      r.headers.set("x-correlacion-id", correlacionId);
      return r;
    } catch (e) {
      const conocido = e instanceof ErrorIntegracion ? { http: e.http, code: e.codigo, message: e.message }
        : e instanceof DocumentoInvalido ? { http: 422, code: "document_invalid", message: `Documento inválido: ${e.message}.` }
        : e instanceof ZodError ? { http: 400, code: "schema_invalid", message: e.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ") }
        : null;
      if (!conocido) registro.error("integración de la tienda: error no controlado", { ruta, correlacion_id: correlacionId, error: e });
      const r = conocido ?? { http: 500, code: "internal", message: "Error inesperado en la fábrica; se puede reintentar." };
      if (r.http !== 503) {
        await registrarAuditoria(bd(), { actor: { tipo: "sistema", ip }, accion: ruta, recurso: "integracion", resultado: "error", origen: "api", correlacionId,
          despues: { codigo: r.code } }).catch((err) => registro.error("no se pudo auditar el rechazo", { correlacion_id: correlacionId, error: err }));
      }
      return errorIntegracion(r.http, r.code, r.message, correlacionId, r.http === 503 ? { "retry-after": "600" } : {});
    }
  };
}
