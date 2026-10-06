// RUT chileno: normalización, dígito verificador (módulo 11) y formato 12.345.678-5 (REQ-COT-9.1).

/** "12.345.678-k" → "12345678-K"; null si no tiene forma de RUT. */
export function normalizarRut(entrada: string): string | null {
  const limpio = entrada.replace(/[.\s]/g, "").toUpperCase();
  const m = /^(\d{1,9})-?([\dK])$/.exec(limpio);
  return m ? `${Number(m[1])}-${m[2]}` : null;
}

export function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const d of String(cuerpo).split("").reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function rutValido(entrada: string): boolean {
  const n = normalizarRut(entrada);
  if (!n) return false;
  const [cuerpo, dv] = n.split("-");
  return Number(cuerpo) >= 1_000_000 && digitoVerificador(Number(cuerpo)) === dv;
}

/** "12345678-5" → "12.345.678-5" */
export function formatearRut(entrada: string): string {
  const n = normalizarRut(entrada);
  if (!n) return entrada;
  const [cuerpo, dv] = n.split("-");
  return `${Number(cuerpo).toLocaleString("es-CL")}-${dv}`;
}
