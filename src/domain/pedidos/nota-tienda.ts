// Lectura determinista de la nota de pedido en PDF del cotizador de la tienda (ADR-0008; REQ-COT-8.6, 8.7). Reconoce
// también el formato «por fábrica» del 23-10-2026 (nota-tienda-fabrica.ts; ADR-0023 §10).
// Puro: recibe los fragmentos de texto con su posición (pdf-texto.ts los extrae). Sin IA y sin datos personales del
// cliente final: de la sección CLIENTE no se lee nada; del despacho, solo dirección, transporte y proyecto.

import { esNotaPorFabrica, leerNotaPorFabrica } from "./nota-tienda-fabrica";

export interface Fragmento { x: number; y: number; texto: string; pagina: number }

export interface LineaNota {
  codigo: string; descripcion: string; medidaSolicitada: string | null;
  cantidad: number; precioUnitario: number; total: number;
}

export interface NotaTienda {
  numero: string;
  fecha: string | null; // aaaa-mm-dd
  refCotizacion: string | null;
  despacho: { direccion: string | null; transporte: string | null; proyecto: string | null; entregaComprometida: string | null };
  lineas: LineaNota[];
  totales: { subtotal: number | null; total: number | null };
  avisos: string[];
}

export class NotaIlegible extends Error {}

/** Código del catálogo: MOD-MADERA-ANCHO-ALTO, p. ej. HUIL-O-3-B, MAR-O-2X4-B, ENDO-O-6X1-I. */
export const CODIGO = /^[A-Z]{2,6}-[A-Z]{1,2}-\d{1,2}(?:X\d{1,2}(?:,\d)?)?-[A-Z]$/;
export const PESOS = /^\$\s?\d{1,3}(?:\.\d{3})*$/;
export const MISMA_LINEA = 3; // puntos de tolerancia vertical

export const pesos = (t: string) => Number(t.replace(/[$\s.]/g, ""));
export const limpio = (t: string) => t.replace(/\s+/g, " ").trim();
const isoDesde = (dmy: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function leerNotaTienda(fragmentos: Fragmento[]): NotaTienda {
  if (esNotaPorFabrica(fragmentos)) return leerNotaPorFabrica(fragmentos);
  // Orden de lectura: página, de arriba hacia abajo (y decreciente en PDF), de izquierda a derecha.
  const fs = fragmentos.map((f) => ({ ...f, texto: limpio(f.texto) })).filter((f) => f.texto)
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const todo = fs.map((f) => f.texto).join(" ");
  if (/\bANULADA\b/.test(todo)) throw new NotaIlegible("La nota está ANULADA: no se puede importar.");
  const numero = /NOTA DE PEDIDO N[°º.]?\s*(\d+)/i.exec(todo)?.[1];
  if (!numero) throw new NotaIlegible("No parece una nota de pedido del cotizador de la tienda (falta «NOTA DE PEDIDO N°»).");

  /** Valor a la derecha de una etiqueta, en la misma línea (o el resto del mismo fragmento). */
  const valor = (etiqueta: RegExp, en?: Fragmento): string | null => {
    const f = en ?? fs.find((x) => etiqueta.test(x.texto));
    if (!f) return null;
    const resto = limpio(f.texto.replace(etiqueta, ""));
    if (resto) return resto;
    const derecha = fs.filter((x) => x.pagina === f.pagina && Math.abs(x.y - f.y) <= MISMA_LINEA && x.x > f.x).sort((a, b) => a.x - b.x);
    return derecha.length ? limpio(derecha.map((x) => x.texto).join(" ")) : null;
  };

  // Columnas por la posición de sus encabezados (en la primera página que los tenga).
  const cabCant = fs.find((f) => /^CANT\.?$/i.test(f.texto));
  // pdfjs puede unir celdas vecinas en un fragmento («TOTAL LISTO»): basta con que empiece por TOTAL.
  const cabTotal = fs.find((f) => /^TOTAL\b/i.test(f.texto) && cabCant && Math.abs(f.y - cabCant.y) <= MISMA_LINEA);
  if (!cabCant || !cabTotal) throw new NotaIlegible("No se encontró la tabla de ítems (columnas CANT. y TOTAL).");
  const cabDesc = fs.find((f) => /^DESCRIPCI[ÓO]N/i.test(f.texto) && Math.abs(f.y - cabCant.y) <= MISMA_LINEA);

  const avisos: string[] = [];
  const lineas: LineaNota[] = [];
  const codigos = fs.filter((f) => CODIGO.test(f.texto));
  if (!codigos.length) throw new NotaIlegible("La nota no tiene ítems con código del catálogo.");
  for (const [k, c] of codigos.entries()) {
    const fila = fs.filter((f) => f.pagina === c.pagina && Math.abs(f.y - c.y) <= MISMA_LINEA && f !== c);
    const enteros = fila.filter((f) => /^\d{1,5}$/.test(f.texto));
    const cant = enteros.sort((a, b) => Math.abs(a.x - cabCant.x) - Math.abs(b.x - cabCant.x))[0];
    const montos = fila.filter((f) => PESOS.test(f.texto)).sort((a, b) => a.x - b.x);
    if (!cant || montos.length < 2) throw new NotaIlegible(`No se pudo leer la fila del código ${c.texto} (cantidad o precios).`);
    const cantidad = Number(cant.texto);
    const precioUnitario = pesos(montos[0].texto);
    const total = pesos(montos[montos.length - 1].texto);
    // Descripción: el texto de la columna DESCRIPCIÓN en la misma línea; «Medida solicitada» va en la línea de abajo.
    const xDesc = cabDesc?.x ?? c.x + 1;
    const descripcion = limpio(fila.filter((f) => f.x >= xDesc - 2 && f.x < cabCant.x - 5 && !PESOS.test(f.texto)).map((f) => f.texto).join(" "));
    const siguiente = codigos[k + 1];
    const debajo = fs.filter((f) => f.pagina === c.pagina && f.y < c.y - MISMA_LINEA && (!siguiente || siguiente.pagina !== c.pagina || f.y > siguiente.y + MISMA_LINEA) && f.y > c.y - 30);
    const medida = debajo.find((f) => /^Medida solicitada:/i.test(f.texto));
    if (cantidad <= 0) throw new NotaIlegible(`Cantidad inválida para ${c.texto}.`);
    if (Math.abs(cantidad * precioUnitario - total) > 1) avisos.push(`${c.texto}: ${cantidad} × ${precioUnitario} no da el total ${total} de la nota.`);
    lineas.push({ codigo: c.texto, descripcion, medidaSolicitada: medida ? limpio(medida.texto.replace(/^Medida solicitada:/i, "")) : null, cantidad, precioUnitario, total });
  }

  const subtotal = valor(/^SUBTOTAL\b/i);
  const filaTotal = fs.find((f) => /^TOTAL\b/i.test(f.texto) && Math.abs(f.y - cabTotal.y) > MISMA_LINEA);
  const totalNota = filaTotal ? valor(/^TOTAL\b/i, filaTotal) : null;
  const suma = lineas.reduce((t, l) => t + l.total, 0);
  if (subtotal && PESOS.test(subtotal) && pesos(subtotal) !== suma) avisos.push(`La suma de los ítems (${suma}) no coincide con el subtotal de la nota (${pesos(subtotal)}): revisa si faltan filas.`);

  const fecha = valor(/^Fecha:/i);
  return {
    numero,
    fecha: fecha ? isoDesde(fecha) : null,
    refCotizacion: valor(/^Ref\. cotizaci[óo]n:/i)?.replace(/^N[°º]\s*/, "") ?? null,
    despacho: {
      direccion: valor(/^Direcci[óo]n de despacho:/i),
      transporte: valor(/^Medio de transporte:/i),
      proyecto: valor(/^Proyecto:/i),
      entregaComprometida: isoDesde(valor(/^Entrega comprometida:/i) ?? ""),
    },
    lineas,
    totales: { subtotal: subtotal && PESOS.test(subtotal) ? pesos(subtotal) : null, total: totalNota && PESOS.test(totalNota) ? pesos(totalNota) : null },
    avisos,
  };
}
