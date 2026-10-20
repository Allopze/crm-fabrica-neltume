// Lectura de URLs de BD desde el entorno. Nunca se registran con credenciales.
import { createHash } from "node:crypto";

export function requerirEnv(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`);
  return v;
}

/** Misma URL apuntando a otra base de datos. */
export function conBase(url: string, base: string): string {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
}

export function partesUrl(url: string) {
  const u = new URL(url);
  return { usuario: decodeURIComponent(u.username), clave: decodeURIComponent(u.password), base: u.pathname.slice(1) };
}

/** Carga .env.local si existe (scripts y tests; Next la carga solo). */
export function cargarEnvLocal(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin archivo: se usan las variables del entorno.
  }
}

/** Identificador SQL seguro: solo letras, números y guion bajo. */
export function ident(nombre: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) throw new Error(`Identificador SQL inválido: ${nombre}`);
  return `"${nombre}"`;
}

/** Usuario de BD del worker de IA (ADR-0017). */
export const USUARIO_WORKER = "neltume_worker";

/**
 * URL del rol de BD propio del worker de IA, con solo los permisos que necesita (ADR-0017). Si DATABASE_URL_WORKER no
 * está definida, se deriva de la URL de la app: mismo servidor y base, usuario `neltume_worker` y una clave que es un
 * hash de la clave de la app (quien tenga la del worker no obtiene la de la app). En Compose se define explícita.
 */
export function urlWorker(urlApp = requerirEnv("DATABASE_URL")): string {
  const explicita = process.env.DATABASE_URL_WORKER;
  if (explicita) return explicita;
  const u = new URL(urlApp);
  u.username = USUARIO_WORKER;
  u.password = createHash("sha256").update(`neltume-worker:${decodeURIComponent(u.password)}`).digest("hex").slice(0, 32);
  return u.toString();
}

/** Usuario de BD del servicio de compras desde Chipax (ADR-0021). */
export const USUARIO_COMPRAS = "neltume_compras";

/**
 * URL del rol de BD del servicio de compras (ADR-0021): solo lee proveedores, mapeos y materias primas, e inserta
 * compras, sus líneas y recepciones de materias primas. Igual que el worker: explícita (`DATABASE_URL_COMPRAS`) o
 * derivada de la de la app con una clave que es un hash de la clave de la app.
 */
export function urlCompras(urlApp = requerirEnv("DATABASE_URL")): string {
  const explicita = process.env.DATABASE_URL_COMPRAS;
  if (explicita) return explicita;
  const u = new URL(urlApp);
  u.username = USUARIO_COMPRAS;
  u.password = createHash("sha256").update(`neltume-compras:${decodeURIComponent(u.password)}`).digest("hex").slice(0, 32);
  return u.toString();
}
