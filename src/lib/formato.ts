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

const SANTIAGO = "America/Santiago";
const santiagoFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SANTIAGO, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Una fecha-hora con zona (Z u offset) se lee en Santiago; una sin zona ya viene en hora local. */
const tieneZona = (iso: string) => /T\d{2}:\d{2}/.test(iso) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);

function enSantiago(valor: Date): { dia: string; hora: string } {
  const p = Object.fromEntries(santiagoFmt.formatToParts(valor).map((x) => [x.type, x.value]));
  return { dia: `${p.day}-${p.month}-${p.year}`, hora: `${p.hour}:${p.minute}` };
}

export function fecha(valor: string | Date): string {
  if (valor instanceof Date) return enSantiago(valor).dia;
  if (tieneZona(valor)) return enSantiago(new Date(valor)).dia;
  const [a, m, d] = valor.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export function fechaHora(valor: string | Date): string {
  if (valor instanceof Date) {
    const p = enSantiago(valor);
    return `${p.dia} ${p.hora}`;
  }
  if (tieneZona(valor)) {
    const p = enSantiago(new Date(valor));
    return `${p.dia} ${p.hora}`;
  }
  return `${fecha(valor)} ${valor.slice(11, 16)}`;
}

export function cn(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(" ");
}
