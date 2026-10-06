// Enmascarado de datos personales ANTES de enviar texto al LLM (SECURITY §4, REQ-COT-2.9).
const PATRONES: [RegExp, string][] = [
  [/https?:\/\/\S+|www\.\S+/gi, "[URL]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[CORREO]"],
  [/\b\d{1,2}\.?\d{3}\.?\d{3}\s?-\s?[\dkK]\b/g, "[RUT]"],
  // Fijos: Santiago 2 + 8 dígitos; regiones 2 dígitos de área + 7. Móviles: 9 + 8 dígitos.
  [/(\+?56[\s.-]?)?\b(?:2[\s.-]?\d{4}[\s.-]?\d{4}|[3-7]\d[\s.-]?\d{3}[\s.-]?\d{4})\b/g, "[TELEFONO]"],
  [/(\+?56[\s.-]?)?\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/g, "[TELEFONO]"],
];

export function redactar(texto: string): { texto: string; reemplazos: number } {
  let reemplazos = 0;
  let salida = texto;
  for (const [patron, marca] of PATRONES) {
    salida = salida.replace(patron, () => { reemplazos++; return marca; });
  }
  return { texto: salida, reemplazos };
}

/** Normaliza el texto del pedido: espacios, comillas, "×" y separadores de medida (DESIGN §3, paso 2). */
export function normalizarPedido(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/(\d)\s*[×xX*]\s*(\d)/g, "$1x$2")
    .replace(/[ \t]+/g, " ")
    .trim();
}
