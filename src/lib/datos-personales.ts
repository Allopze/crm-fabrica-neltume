// Enmascarado de datos personales en texto libre (SECURITY §4, REQ-COT-2.9, REQ-NFR-5). Lo usan el texto que va al
// LLM (src/ai/redaccion.ts) y los logs (src/lib/registro.ts). Ante la duda se enmascara de más (auditoría H-03).

/** Guiones Unicode (‐ ‑ ‒ – — ― −, y variantes de ancho completo) entre cifras: «12.345.678–9» es un RUT. */
const GUION_ENTRE_CIFRAS = /(?<=\d)\s*[‐-―−﹘﹣－]\s*(?=[\dkK])/g;
const CIFRA_ANCHA = /[０-９]/g;

const PATRONES: [RegExp, string][] = [
  [/https?:\/\/\S+|www\.\S+/giu, "[URL]"],
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[CORREO]"],
  // «juan [at] gmail.com», «juan arroba gmail punto com».
  [/[\p{L}\p{N}._%+-]+\s*(?:\[at\]|\(at\)|\sarroba\s)\s*[\p{L}\p{N}-]+(?:\s*(?:\.|\[dot\]|\(dot\)|\spunto\s)\s*[\p{L}\p{N}-]+)+/giu, "[CORREO]"],
  // RUT con o sin puntos o espacios entre grupos y con guion: 12.345.678-9, 12 345 678-9, 1.234.567-K.
  [/(?<![\p{N}.])\d{1,2}(?:[.\s]?\d{3}){2}\s*-\s*[\dkK](?![\p{L}\p{N}])/gu, "[RUT]"],
  // RUT sin guion terminado en K: 12345678K.
  [/(?<![\p{N}.])\d{7,8}[kK](?![\p{L}\p{N}])/gu, "[RUT]"],
  // Móvil: 9 + 8 cifras con cualquier agrupación, paréntesis y +56/56 opcional (+56987654321, (9) 8765-4321, 9 87 65 43 21).
  [/(?<![\p{N}])(?:(?:\+\s?)?\(?56\)?[\s.-]?)?\(?9\)?(?:[\s.-]?\d){8}(?![\p{N}])/gu, "[TELEFONO]"],
  // Fijo: Santiago 2 + 8 cifras; regiones 2 cifras de área + 7.
  [/(?<![\p{N}])(?:(?:\+\s?)?\(?56\)?[\s.-]?)?\(?(?:2\)?(?:[\s.-]?\d){8}|[3-7]\d\)?(?:[\s.-]?\d){7})(?![\p{N}])/gu, "[TELEFONO]"],
  // Red: toda secuencia de 7 o más cifras (seguidas o con puntos) puede ser un RUT, teléfono o documento. Medidas y
  // cantidades tienen hasta 4 cifras. Ni espacios ni guiones unen grupos: no se tragan medidas («90 210»), fechas
  // («07-10-2026») ni los segmentos de un UUID en los logs.
  [/(?<![\p{N}.,-])\d(?:\.?\d){6,}(?![\p{N}-])/gu, "[NUMERO]"],
];

/** Reemplaza RUT, correo, teléfono, URL y secuencias largas de cifras. `marca` fija un único reemplazo (logs). */
export function enmascararDatosPersonales(texto: string, marca?: string): { texto: string; reemplazos: number } {
  let reemplazos = 0;
  let salida = texto
    .replace(CIFRA_ANCHA, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48))
    .replace(GUION_ENTRE_CIFRAS, "-");
  for (const [patron, etiqueta] of PATRONES) {
    salida = salida.replace(patron, () => { reemplazos++; return marca ?? etiqueta; });
  }
  return { texto: salida, reemplazos };
}
