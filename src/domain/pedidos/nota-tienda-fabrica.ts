// Lectura de la nota de pedido «por fábrica» que emite la tienda desde el 23-10-2026 (ADR-0023 §10, T19.9; respaldo
// de la API cuando hay que subir el PDF a mano, ADR-0008). Cambios frente al formato anterior: el código va en
// «Referencia de catálogo: NEL-O-3-A · …» bajo la descripción, y la cantidad y los precios en la línea de arriba;
// trae «Fábrica Panguipulli», «Precio fábrica» y «Neto». Del cliente final no se lee nada.
import type { Fragmento, LineaNota, NotaTienda } from "./nota-tienda";
import { CODIGO, limpio, MISMA_LINEA, NotaIlegible, PESOS, pesos } from "./nota-tienda";

export const esNotaPorFabrica = (fs: Fragmento[]) => fs.some((f) => /^Referencia de cat[áa]logo:/i.test(f.texto.trim()));

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «23 de octubre de 2026» → 2026-10-23. */
export function fechaEnPalabras(t: string): string | null {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(t.trim());
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) + 1 : 0;
  return m && mes ? `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function leerNotaPorFabrica(entrada: Fragmento[]): NotaTienda {
  const fs = entrada.map((f) => ({ ...f, texto: limpio(f.texto) })).filter((f) => f.texto)
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  if (fs.some((f) => /\bANULADA\b/.test(f.texto))) throw new NotaIlegible("La nota está ANULADA: no se puede importar.");
  const titulo = fs.findIndex((f) => /^Nota de pedido$/i.test(f.texto));
  const numero = titulo >= 0 ? fs.slice(titulo + 1, titulo + 4).map((f) => /^N[°º]\s*(\d+)$/.exec(f.texto)?.[1]).find(Boolean) : undefined;
  if (!numero) throw new NotaIlegible("No parece una nota de pedido del cotizador de la tienda (falta «Nota de pedido N°»).");
  const fabrica = fs.find((f) => /^Fábrica\s+\S+/i.test(f.texto))?.texto.replace(/^Fábrica\s+/i, "");
  if (fabrica && !/panguipulli/i.test(fabrica)) throw new NotaIlegible(`Esta nota es para la fábrica de ${fabrica}, no para Panguipulli.`);

  /** El valor bajo una etiqueta (encabezado de la nota) o a su derecha en la misma línea (bloques de despacho). */
  const debajo = (etiqueta: RegExp) => {
    const e = fs.find((f) => etiqueta.test(f.texto));
    return e ? fs.find((f) => f.pagina === e.pagina && f.y < e.y - MISMA_LINEA && f.y > e.y - 20 && Math.abs(f.x - e.x) < 15)?.texto ?? null : null;
  };
  const derecha = (etiqueta: RegExp, fuera?: Fragmento) => {
    const e = fs.find((f) => etiqueta.test(f.texto) && (!fuera || f.pagina !== fuera.pagina || Math.abs(f.y - fuera.y) > MISMA_LINEA));
    if (!e) return null;
    const v = fs.filter((f) => f.pagina === e.pagina && Math.abs(f.y - e.y) <= MISMA_LINEA && f.x > e.x + 5).sort((a, b) => a.x - b.x);
    return v.length ? limpio(v.map((f) => f.texto).join(" ")) : null;
  };

  const cabCant = fs.find((f) => /^Cant\.?$/i.test(f.texto));
  if (!cabCant || !fs.some((f) => /^Precio f[áa]brica$/i.test(f.texto) && Math.abs(f.y - cabCant.y) <= MISMA_LINEA)) {
    throw new NotaIlegible("No se encontró la tabla de ítems (columnas Cant. y Precio fábrica).");
  }
  const referencias = fs.filter((f) => /^Referencia de cat[áa]logo:/i.test(f.texto));
  const lineas: LineaNota[] = [];
  const avisos: string[] = [];
  for (const r of referencias) {
    const codigo = /^Referencia de cat[áa]logo:\s*(\S+)/i.exec(r.texto)?.[1] ?? "";
    if (!CODIGO.test(codigo)) throw new NotaIlegible(`La referencia «${r.texto}» no trae un código del catálogo.`);
    // La línea del ítem es la más cercana por encima con una cantidad en la columna Cant.
    const fila = fs.filter((f) => f.pagina === r.pagina && f.y > r.y && f.y < r.y + 40 && /^\d{1,5}$/.test(f.texto) && Math.abs(f.x - cabCant.x) < 20)
      .sort((a, b) => a.y - b.y)[0];
    if (!fila) throw new NotaIlegible(`No se pudo leer la cantidad del ítem ${codigo}.`);
    const montos = fs.filter((f) => f.pagina === r.pagina && Math.abs(f.y - fila.y) <= MISMA_LINEA && PESOS.test(f.texto)).sort((a, b) => a.x - b.x);
    if (montos.length < 2) throw new NotaIlegible(`No se pudieron leer los precios del ítem ${codigo}.`);
    const columna = fs.filter((f) => f.pagina === r.pagina && Math.abs(f.x - r.x) < 3 && f.y > r.y && f.y <= fila.y + 20);
    const medida = columna.find((f) => /^Medida solicitada:/i.test(f.texto));
    const descripcion = columna.filter((f) => !/^Medida solicitada:/i.test(f.texto)).sort((a, b) => b.y - a.y)[0]?.texto ?? "";
    const cantidad = Number(fila.texto);
    const precioUnitario = pesos(montos[0].texto);
    const total = pesos(montos[montos.length - 1].texto);
    if (cantidad <= 0) throw new NotaIlegible(`Cantidad inválida para ${codigo}.`);
    if (Math.abs(cantidad * precioUnitario - total) > 1) avisos.push(`${codigo}: ${cantidad} × ${precioUnitario} no da el total ${total} de la nota.`);
    lineas.push({ codigo, descripcion, medidaSolicitada: medida ? limpio(medida.texto.replace(/^Medida solicitada:/i, "")) : null, cantidad, precioUnitario, total });
  }
  if (!lineas.length) throw new NotaIlegible("La nota no tiene ítems con código del catálogo.");

  const neto = derecha(/^Neto$/i);
  const total = derecha(/^Total$/i, cabCant); // no la columna «Total» del encabezado de la tabla
  const suma = lineas.reduce((t, l) => t + l.total, 0);
  if (neto && PESOS.test(neto) && pesos(neto) !== suma) avisos.push(`La suma de los ítems (${suma}) no coincide con el neto de la nota (${pesos(neto)}): revisa si faltan filas.`);
  const entrega = derecha(/^Entrega comprometida$/i);
  return {
    numero,
    // La fecha va alineada a la derecha bajo «Fecha»: la primera en palabras sobre la tabla.
    fecha: fs.filter((f) => f.pagina === cabCant.pagina && f.y > cabCant.y).map((f) => fechaEnPalabras(f.texto)).find(Boolean) ?? null,
    refCotizacion: debajo(/^Cotizaci[óo]n$/i)?.replace(/^N[°º]\s*/, "") ?? null,
    despacho: {
      direccion: derecha(/^Direcci[óo]n de despacho$/i),
      transporte: derecha(/^Transporte$/i),
      proyecto: debajo(/^Despacho$/i),
      entregaComprometida: entrega && /^\d{2}-\d{2}-\d{4}$/.test(entrega) ? `${entrega.slice(6)}-${entrega.slice(3, 5)}-${entrega.slice(0, 2)}` : null,
    },
    lineas,
    totales: { subtotal: neto && PESOS.test(neto) ? pesos(neto) : null, total: total && PESOS.test(total) ? pesos(total) : null },
    avisos,
  };
}
