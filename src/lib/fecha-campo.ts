// Campo de fecha propio (UX §1): se escribe dd-mm-aaaa como en el resto de la app, sin depender del idioma del navegador.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function valida(a: number, m: number, d: number): boolean {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** «21-10-2026», «21/10/2026», «21.10.26», «21102026» o «2026-10-21» → «2026-10-21»; null si no es una fecha real. */
export function leerFecha(texto: string): string | null {
  const t = texto.trim();
  const i = ISO.exec(t);
  if (i) return valida(+i[1], +i[2], +i[3]) ? t : null;
  const partes = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!partes) return null;
  const [d, m] = [+partes[1], +partes[2]];
  const a = partes[3].length === 2 ? 2000 + +partes[3] : +partes[3];
  return valida(a, m, d) ? iso(a, m, d) : null;
}

/** Guiones automáticos mientras se escriben solo cifras: «2110» → «21-10», «21102026» → «21-10-2026». */
export function formatearMientrasEscribe(texto: string): string {
  if (/[^\d]/.test(texto)) return texto.slice(0, 10);
  const c = texto.slice(0, 8);
  return [c.slice(0, 2), c.slice(2, 4), c.slice(4)].filter(Boolean).join("-");
}

/** Hoy en Santiago como «aaaa-mm-dd» (las fechas de la app son días de Chile). */
export function hoyIso(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Suma días a una fecha «aaaa-mm-dd» sin pasar por la zona horaria. */
export function sumarDias(fechaIso: string, dias: number): string {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** Semanas del mes (lunes primero) con las fechas «aaaa-mm-dd»; null en los huecos antes del 1 y después del último día. */
export function semanasDelMes(anio: number, mes: number): (string | null)[][] {
  const primero = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const celdas: (string | null)[] = [...Array(primero).fill(null), ...Array.from({ length: dias }, (_, i) => iso(anio, mes, i + 1))];
  while (celdas.length % 7) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, s) => celdas.slice(s * 7, s * 7 + 7));
}
