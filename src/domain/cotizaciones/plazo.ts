// Plazo que pide el cliente en el texto del pedido, leído sin IA (REQ-COT-2.20). Es una referencia para el vendedor:
// nunca fija la entrega comprometida de la nota de pedido, que la decide una persona.

export interface PlazoPedido { frase: string; fecha: string | null }

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
// Una fecha corta («30-10», «el 5/11») solo cuenta con una de estas palabras delante: sin ellas puede ser otra cosa.
const ANTES_DE_FECHA = /(?:para|antes|hasta|entrega|plazo|necesit\w*|el|del|al)\s*:?\s*$/;

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valida = (a: number, m: number, d: number) => {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};
const sumarDias = (hoy: string, n: number) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Sin año: la próxima vez que llega ese día (hoy incluido). */
function proxima(hoy: string, m: number, d: number, a?: number): string | null {
  const actual = Number(hoy.slice(0, 4));
  if (a !== undefined) return valida(a, m, d) ? iso(a, m, d) : null;
  for (const anio of [actual, actual + 1]) if (valida(anio, m, d) && iso(anio, m, d) >= hoy) return iso(anio, m, d);
  return null;
}

const anioDe = (s?: string) => (s ? (s.length === 2 ? 2000 + Number(s) : Number(s)) : undefined);

type Lector = { patron: RegExp; fecha: (m: RegExpExecArray, hoy: string, antes: string) => string | null | false };

// `false` descarta la coincidencia (no es un plazo); `null` es un plazo sin fecha calculable.
const LECTORES: Lector[] = [
  { patron: new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MESES.join("|")})(?:\\s+(?:de|del)?\\s*(\\d{4}))?`, "g"),
    fecha: (m, hoy) => proxima(hoy, MESES.indexOf(m[2]) + 1, Number(m[1]), anioDe(m[3])) ?? false },
  { patron: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?![\d/x.,-])/g,
    fecha: (m, hoy, antes) => (m[3] || ANTES_DE_FECHA.test(antes) ? proxima(hoy, Number(m[2]), Number(m[1]), anioDe(m[3])) ?? false : false) },
  { patron: new RegExp(`\\b(?:para|antes del?|hasta|el)\\s+(?:el\\s+|este\\s+|proximo\\s+)?(${DIAS.join("|")})\\b`, "g"),
    fecha: (m, hoy) => {
      const dia = new Date(`${hoy}T00:00:00Z`).getUTCDay();
      return sumarDias(hoy, ((DIAS.indexOf(m[1]) - dia + 7) % 7) || 7);
    } },
  { patron: /\b(?:para|a|antes de)\s+fin(?:es)?\s+de\s+mes\b/g,
    fecha: (_m, hoy) => new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10) },
  { patron: /\ben\s+(\d{1,2}|una|dos|tres|cuatro)\s+(dias|semanas?)\b/g,
    fecha: (m, hoy) => {
      const n = ({ una: 1, dos: 2, tres: 3, cuatro: 4 } as Record<string, number>)[m[1]] ?? Number(m[1]);
      return sumarDias(hoy, m[2].startsWith("semana") ? n * 7 : n);
    } },
  { patron: /\b(?:urgente|lo antes posible|lo mas pronto posible|a la brevedad|(?:esta|la proxima|la otra) semana|la semana que viene)\b/g,
    fecha: () => null },
];

/** Minúsculas y sin tildes, unidad por unidad, para que los índices sigan apuntando al texto original. */
const plano = (texto: string) => texto.toLowerCase().split("").map((c) => c.normalize("NFD")[0]).join("");

/** La primera mención de plazo en el texto, con la frase tal cual y su fecha si se puede calcular desde `hoy`. */
export function leerPlazo(texto: string, hoy: string): PlazoPedido | null {
  const p = plano(texto);
  let mejor: { inicio: number; fin: number; fecha: string | null } | null = null;
  for (const { patron, fecha } of LECTORES) {
    patron.lastIndex = 0;
    for (let m = patron.exec(p); m; m = patron.exec(p)) {
      if (mejor && m.index >= mejor.inicio) break;
      const f = fecha(m, hoy, p.slice(Math.max(0, m.index - 20), m.index));
      if (f !== false) { mejor = { inicio: m.index, fin: m.index + m[0].length, fecha: f }; break; }
    }
  }
  return mejor && { frase: texto.slice(mejor.inicio, mejor.fin), fecha: mejor.fecha };
}
