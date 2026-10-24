// Firma HMAC de la API de la tienda (ADR-0023 §2). Igual a `verificarFirma` del cotizador de la tienda
// (src/servidor/integracion-firma.ts): HMAC-SHA256 con clave = UTF-8 del secreto, sobre
// UTF-8(timestamp) ‖ "." ‖ bytes crudos del cuerpo; cabecera `v1=<hex>`, varias separadas por coma al rotar.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCIA_FIRMA_S = 300;
const VERSION = "v1";
/** Un secreto más corto no se acepta: 32 bytes aleatorios en base64 tienen 43 o 44 caracteres. */
export const LARGO_MINIMO_SECRETO = 32;

export function firmaHmac(secreto: string, timestamp: string, cuerpo: Uint8Array): string {
  return createHmac("sha256", Buffer.from(secreto, "utf8")).update(Buffer.from(`${timestamp}.`, "utf8")).update(cuerpo).digest("hex");
}

/** Cabeceras firmadas, para las pruebas y el envío de prueba (`npm run integracion:enviar-prueba`). */
export function firmar(secreto: string, cuerpo: Uint8Array, ahora = Date.now()) {
  const timestamp = String(Math.floor(ahora / 1000));
  return { "x-neltume-timestamp": timestamp, "x-neltume-signature": `${VERSION}=${firmaHmac(secreto, timestamp, cuerpo)}` };
}

export type MotivoFirma = "sin_firma" | "timestamp_invalido" | "fuera_de_plazo" | "firma_invalida";

/** Verifica antes de interpretar el cuerpo, en tiempo constante y contra cada secreto vigente. */
export function verificarFirma(
  secretos: string[], cabeceras: { timestamp: string | null; firma: string | null }, cuerpo: Uint8Array, ahora = Date.now(),
): { ok: true } | { ok: false; motivo: MotivoFirma } {
  const { timestamp, firma } = cabeceras;
  if (!timestamp || !firma) return { ok: false, motivo: "sin_firma" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, motivo: "timestamp_invalido" };
  if (Math.abs(Math.floor(ahora / 1000) - Number(timestamp)) > TOLERANCIA_FIRMA_S) return { ok: false, motivo: "fuera_de_plazo" };
  const recibidas = firma.split(",").map((f) => f.trim()).filter((f) => f.startsWith(`${VERSION}=`))
    .map((f) => Buffer.from(f.slice(VERSION.length + 1), "utf8"));
  for (const secreto of secretos) {
    const esperada = Buffer.from(firmaHmac(secreto, timestamp, cuerpo), "utf8");
    if (recibidas.some((r) => r.length === esperada.length && timingSafeEqual(r, esperada))) return { ok: true };
  }
  return { ok: false, motivo: "firma_invalida" };
}

export interface ConfigIntegracion { secretos: string[]; fabrica: string; clienteRut: string | null }

/**
 * Configuración desde el entorno del servicio `app` (ADR-0023 §9). Sin un secreto válido la integración está
 * apagada (503). Se lee en cada petición: los secretos nunca se copian a logs, respuestas ni BD.
 */
export function configIntegracion(env: NodeJS.ProcessEnv = process.env): ConfigIntegracion | null {
  const secretos = [env.INTEGRACION_TIENDA_SECRETO, env.INTEGRACION_TIENDA_SECRETO_ANTERIOR]
    .map((s) => s?.trim() ?? "").filter((s) => s.length >= LARGO_MINIMO_SECRETO);
  if (!env.INTEGRACION_TIENDA_SECRETO || secretos.length === 0) return null;
  return { secretos, fabrica: env.INTEGRACION_TIENDA_FABRICA?.trim().toUpperCase() || "PANGUIPULLI", clienteRut: env.INTEGRACION_TIENDA_CLIENTE_RUT?.trim() || null };
}
