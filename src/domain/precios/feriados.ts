// Feriados nacionales de Chile calculados por ley (REQ-COT-6.6). Puro y sin conexión: los decretados por única
// vez (elecciones, leyes puntuales) se cargan a mano en la tabla `feriado` y se suman a estos.
// Portado del cotizador de la tienda (referencia/src/negocio/feriados.ts), verificado contra calendarios oficiales.

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diaSemana = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d)).getUTCDay();
const desplazar = (a: number, m: number, d: number, dias: number) => {
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
};

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function pascua(a: number) {
  const x = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * x + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((x + 11 * h + 22 * l) / 451);
  return { mes: Math.floor((h + l - 7 * m + 114) / 31), dia: ((h + l - 7 * m + 114) % 31) + 1 };
}

// Términos periódicos de Meeus (tabla 27.C) para la hora del solsticio.
const TERMINOS: [number, number, number][] = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886],
  [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147],
  [52, 297.17, 150.678], [50, 21.02, 2281.226], [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
  [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848],
  [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
];
const rad = (g: number) => (g * Math.PI) / 180;

/** Día de los Pueblos Indígenas (Ley 21.357): fecha del solsticio de invierno en hora de Santiago. */
export function solsticioInvierno(a: number): string {
  const y = (a - 2000) / 1000;
  const jde0 = 2451716.56767 + 365241.62603 * y + 0.00325 * y ** 2 + 0.00888 * y ** 3 - 0.0003 * y ** 4;
  const t = (jde0 - 2451545) / 36525;
  const w = rad(35999.373 * t - 2.47);
  const dl = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
  const s = TERMINOS.reduce((suma, [A, B, C]) => suma + A * Math.cos(rad(B + C * t)), 0);
  const ms = (jde0 + (0.00001 * s) / dl - 2440587.5) * 86_400_000 - 70_000; // ΔT ≈ 70 s
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(ms));
}

/** Ley 19.668: martes a jueves → lunes de esa semana; viernes → lunes siguiente. */
function trasladable(a: number, m: number, d: number) {
  const dia = diaSemana(a, m, d);
  if (dia >= 2 && dia <= 4) return desplazar(a, m, d, 1 - dia);
  if (dia === 5) return desplazar(a, m, d, 3);
  return iso(a, m, d);
}

const cache = new Map<number, ReadonlyMap<string, string>>();

/** Feriados legales del año: fecha (aaaa-mm-dd) → nombre. */
export function feriadosLegales(a: number): ReadonlyMap<string, string> {
  const guardado = cache.get(a);
  if (guardado) return guardado;
  const p = pascua(a);
  const f: [string, string][] = [
    [iso(a, 1, 1), "Año Nuevo"],
    [desplazar(a, p.mes, p.dia, -2), "Viernes Santo"],
    [desplazar(a, p.mes, p.dia, -1), "Sábado Santo"],
    [iso(a, 5, 1), "Día del Trabajo"],
    [iso(a, 5, 21), "Glorias Navales"],
    [trasladable(a, 6, 29), "San Pedro y San Pablo"],
    [iso(a, 7, 16), "Virgen del Carmen"],
    [iso(a, 8, 15), "Asunción de la Virgen"],
    [iso(a, 9, 18), "Independencia Nacional"],
    [iso(a, 9, 19), "Glorias del Ejército"],
    [trasladable(a, 10, 12), "Encuentro de Dos Mundos"],
    [iso(a, 11, 1), "Todos los Santos"],
    [iso(a, 12, 8), "Inmaculada Concepción"],
    [iso(a, 12, 25), "Navidad"],
  ];
  // Ley 21.357: el 21 de junio en 2021; desde 2022, el día del solsticio.
  if (a === 2021) f.push([iso(a, 6, 21), "Pueblos Indígenas"]);
  else if (a > 2021) f.push([solsticioInvierno(a), "Pueblos Indígenas"]);
  // Ley 20.983: 2 de enero si es lunes.
  if (diaSemana(a, 1, 2) === 1) f.push([iso(a, 1, 2), "Feriado de Año Nuevo (Ley 20.983)"]);
  // Ley 20.215: 17 de septiembre si es lunes; 20 de septiembre si es viernes.
  if (diaSemana(a, 9, 17) === 1) f.push([iso(a, 9, 17), "Fiestas Patrias (Ley 20.215)"]);
  if (diaSemana(a, 9, 20) === 5) f.push([iso(a, 9, 20), "Fiestas Patrias (Ley 20.215)"]);
  // Ley 20.299: Iglesias Evangélicas; martes → viernes 27, miércoles → viernes 2 de noviembre.
  const ev = diaSemana(a, 10, 31);
  f.push([ev === 2 ? iso(a, 10, 27) : ev === 3 ? iso(a, 11, 2) : iso(a, 10, 31), "Iglesias Evangélicas y Protestantes"]);
  const mapa = new Map(f);
  cache.set(a, mapa);
  return mapa;
}
