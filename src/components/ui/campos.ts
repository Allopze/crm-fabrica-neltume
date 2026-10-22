// Clases compartidas de campos: la regla táctil de UX §1 (≥44 px en puntero grueso) vive en un solo lugar.

const base = "rounded-md border border-linea-fuerte bg-lamina text-sm text-tinta focus:border-tinta focus:outline-none disabled:opacity-60";

/** Campo de formulario estándar (36 px de alto; 44 px en táctil). */
export const campo = `h-9 px-3 ${base} pointer-coarse:h-11`;

/** Campo de formulario alto, para formularios de ficha (40 px; 44 px en táctil). */
export const campoAlto = `h-10 px-3 ${base} pointer-coarse:h-11`;

/** Campo compacto para tablas y edición en línea (32–36 px; 44 px en táctil). */
export const campoCompacto = `h-9 px-2 ${base} pointer-coarse:h-11`;

/** Campo numérico alineado a la derecha. */
export const campoNumero = `${campoCompacto} text-right tabular-nums`;

/** Texto largo que crece con lo escrito (sin la manija nativa de redimensionar). */
export const areaTexto = `w-full min-h-20 resize-none px-3 py-2 field-sizing-content ${base}`;
