// Lectura de URLs de BD desde el entorno. Nunca se registran con credenciales.

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
