// Logs en JSON a stdout (DESIGN §5). Redacta credenciales y datos personales (SECURITY T5, §4).
import { enmascararDatosPersonales } from "./datos-personales";

type Nivel = "debug" | "info" | "warn" | "error";

const CLAVES_REDACTADAS = new Set([
  "authorization", "cookie", "set-cookie", "x-api-key", "x-csrf-token", "idempotency-key",
  "password", "clave", "hashpassword", "hash_password", "token", "tokenhash", "token_hash", "csrf", "csrftoken",
  "rut", "email", "correo", "telefono", "teléfono", "direccion", "dirección",
]);
// RUT, correo, teléfono y cifras largas: los mismos patrones que antes del LLM (src/lib/datos-personales.ts).
const BEARER = /Bearer\s+[\w.-]+/gi;
const redactarTexto = (t: string) => enmascararDatosPersonales(t, "[REDACTADO]").texto.replace(BEARER, "[REDACTADO]");

/**
 * Un error de la BD (Drizzle) trae en su mensaje los parámetros de la consulta: el PDF de una prueba de conexión, o su solicitud
 * con la firma vigente. Se registra el principio (la consulta y el motivo) y no el resto: el log no es lugar para bytes ni firmas.
 */
export const MAX_MENSAJE_ERROR = 1_500;
const recortarError = (m: string) => (m.length > MAX_MENSAJE_ERROR ? `${m.slice(0, MAX_MENSAJE_ERROR)}… [recortado: ${m.length} caracteres]` : m);

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return "[…]";
  if (typeof valor === "string") return redactarTexto(valor);
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (valor instanceof Error) return { nombre: valor.name, mensaje: redactar(recortarError(valor.message), profundidad + 1) };
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, CLAVES_REDACTADAS.has(k.toLowerCase()) ? "[REDACTADO]" : redactar(v, profundidad + 1)]),
    );
  }
  return valor;
}

function escribir(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>): void {
  const linea = JSON.stringify({ ts: new Date().toISOString(), nivel, mensaje, ...(redactar(datos ?? {}) as object) });
  (nivel === "error" || nivel === "warn" ? process.stderr : process.stdout).write(linea + "\n");
}

export const registro = {
  debug: (m: string, d?: Record<string, unknown>) => process.env.NODE_ENV !== "production" && escribir("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => escribir("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => escribir("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => escribir("error", m, d),
};
