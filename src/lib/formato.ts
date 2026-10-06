// Formato chileno: CLP sin decimales, miles con punto, fechas dd-mm-aaaa.
const clpFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function clp(valor: number): string {
  return `$${clpFmt.format(Math.round(valor))}`;
}

export function numero(valor: number): string {
  return numFmt.format(valor);
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
