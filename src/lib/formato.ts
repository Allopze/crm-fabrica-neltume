// Formato chileno: CLP sin decimales, miles con punto, fechas dd-mm-aaaa.
const clpFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function clp(valor: number): string {
  return `$${clpFmt.format(Math.round(valor))}`;
}

export function numero(valor: number): string {
  return numFmt.format(valor);
}

const cantFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 4 });

/** Cantidad de una receta, sin perder precisión: 1/70 = «0,0143», no «0,01». */
export function cantidad(valor: number): string {
  return cantFmt.format(valor);
}

/** Lectura de taller para usos fraccionarios: 0,0143 → «1 cada 70 puertas»; null si no es una fracción simple. */
export function usoPorPuerta(valor: number): string | null {
  if (!(valor > 0 && valor < 1)) return null;
  const n = Math.round(1 / valor);
  return n >= 2 && Math.abs(1 / n - valor) <= 0.0001 ? `1 cada ${n} puertas` : null;
}

/** Lee una cantidad escrita como «0,4», «0.4» o «1/70». NaN si no es válida. */
export function leerCantidad(texto: string): number {
  const t = texto.trim().replace(/\s+/g, "");
  const f = /^(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(t);
  if (f) return Number(f[1].replace(",", ".")) / Number(f[2].replace(",", "."));
  return /^\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN;
}

const mFmt = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function metros(valor: number): string {
  return mFmt.format(valor);
}

export function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export function fechaHora(iso: string): string {
  return `${fecha(iso)} ${iso.slice(11, 16)}`;
}

export function cn(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(" ");
}
