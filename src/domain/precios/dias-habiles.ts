// Días hábiles en Chile: lunes a viernes, descontando la tabla `feriado` (REQ-COT-6.4, DESIGN §3).

const DIA_MS = 86_400_000;

/** Fecha ISO (aaaa-mm-dd) más `n` días hábiles. No cuenta el día de partida. */
export function sumarDiasHabiles(desdeIso: string, n: number, feriados: ReadonlySet<string>): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("n debe ser un entero no negativo");
  let t = Date.parse(`${desdeIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) throw new RangeError("Fecha inválida");
  let restantes = n;
  while (restantes > 0) {
    t += DIA_MS;
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !feriados.has(iso)) restantes--;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** Fecha de hoy en Santiago (aaaa-mm-dd), independiente de la zona del servidor. */
export function hoySantiago(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
