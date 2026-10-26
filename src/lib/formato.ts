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

const mmFmt = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Medida exacta en metros desde milímetros: 885 → «0,885», 2100 → «2,10». */
export function metrosDesdeMm(mm: number): string {
  return mmFmt.format(mm / 1000);
}

/** Dólares con coma decimal (tarifas y gasto de la IA): 0.15 → «US$ 0,15». */
export function usd(valor: number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined) return "—";
  return `US$ ${new Intl.NumberFormat("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: Math.max(decimales, 4) }).format(valor)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-10-25» → «25 de octubre de 2026». Solo para el encabezado de los PDF (ADR-0025 D7); lo demás va en dd-mm-aaaa. */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : iso;
}

export const capital = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CL") + texto.slice(1);

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/**
 * Texto importado TODO EN MAYÚSCULAS, como se escribe a mano: «MIREYA OBANDO» → «Mireya Obando». Lo que ya trae
 * minúsculas se deja tal cual. Con `particulas`, «de la» queda en minúscula dentro de un nombre de persona.
 */
function enMayusculasALeible(texto: string, particulas: boolean): string {
  if (/\p{Ll}/u.test(texto) || !/\p{Lu}.*\p{Lu}/u.test(texto)) return texto;
  return texto.toLocaleLowerCase("es-CL").replace(/(^|[\s(«"/-])(\p{L}+)/gu, (_, antes: string, palabra: string, i: number) =>
    antes + (particulas && i > 0 && PARTICULAS.has(palabra) ? palabra : capital(palabra)));
}

/** Nombre de persona o estado importado: «JUAN DE LA FUENTE» → «Juan de la Fuente». */
export const nombrePropio = (texto: string) => enMayusculasALeible(texto, true);

/** Nombre de modelo o tipo: «ESPECIAL LOS LAGOS» → «Especial Los Lagos». */
export const titulo = (texto: string) => enMayusculasALeible(texto, false);

const sinTildes = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const MADERAS: Record<string, string> = { "pino oregon": "Pino Oregón", oregon: "Pino Oregón", lenga: "Lenga", mara: "Mara", rauli: "Raulí", alamo: "Álamo" };

/** Madera con su nombre de catálogo y sus tildes, aunque la BD la tenga en mayúsculas: «PINO OREGON» → «Pino Oregón». */
export function nombreMadera(texto: string): string {
  return MADERAS[sinTildes(texto).toLowerCase().trim()] ?? titulo(texto);
}

/** Punto que cierra una oración que termina en un nombre, salvo que el nombre ya lo traiga («Ltda.»). */
export const puntoFinal = (texto: string) => (/[.!?…]$/.test(texto.trim()) ? "" : ".");

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
