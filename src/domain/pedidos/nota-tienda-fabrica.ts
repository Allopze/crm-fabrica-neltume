// Lectura de la nota de pedido «por fábrica» que emite la tienda desde el 23-10-2026 (ADR-0023 §10, T19.9; respaldo
// de la API cuando hay que subir el PDF a mano, ADR-0008). Cambios frente al formato anterior: el código va en
// «Referencia de catálogo: NEL-O-3-A · …» bajo la descripción, y la cantidad y los precios en la línea de arriba;
// trae «Fábrica Panguipulli», «Precio fábrica» y «Neto». Del cliente final no se lee nada.
import type { Fragmento, LineaNota, NotaTienda } from "./nota-tienda";
import { CODIGO, isoDesde, limpio, MISMA_LINEA, NotaIlegible, NUMERO_NOTA, PESOS, pesos } from "./nota-tienda";

export const esNotaPorFabrica = (fs: Fragmento[]) => fs.some((f) => /^Referencia de cat[áa]logo:/i.test(f.texto.trim()));

/** Tolerancia horizontal entre «Cant.» y la cantidad de un ítem: con las dos alineadas a la derecha quedan ~15 pt aparte. */
const TOL_CANTIDAD = 30;
/**
 * Distancia máxima entre la cantidad de un ítem y su «Referencia de catálogo»: con una descripción larga la fila crece y la
 * cantidad, centrada en vertical, se aleja (medido por la tienda: ~47 pt con 260 caracteres). Nunca pasa de la referencia del
 * ítem anterior, para no tomar su cantidad cuando falta la propia.
 */
const LIMITE_FILA = 120;

/**
 * pdfjs parte un fragmento cuando cambia la fuente: con el código en otra tipografía llega «Referencia de catálogo:» por
 * un lado y el código por otro, en la misma línea. Los une para que el ancla de cada ítem siga siendo una sola (estilo común v1, §8.2).
 */
function unirReferencias(fs: Fragmento[]): Fragmento[] {
  const absorbidos = new Set<Fragmento>();
  const unidos = fs.map((f) => {
    if (!/^Referencia de cat[áa]logo:$/i.test(f.texto.trim())) return f;
    const resto = fs.filter((g) => g.pagina === f.pagina && Math.abs(g.y - f.y) <= MISMA_LINEA && g.x > f.x && g.texto.trim())
      .sort((a, b) => a.x - b.x)[0];
    if (!resto) return f;
    absorbidos.add(resto);
    return { ...f, texto: `${f.texto.trim()} ${resto.texto.trim()}` };
  });
  return unidos.filter((f) => !absorbidos.has(f));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «23 de octubre de 2026» → 2026-10-23. */
export function fechaEnPalabras(t: string): string | null {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(t.trim());
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) + 1 : 0;
  return m && mes ? `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function leerNotaPorFabrica(entrada: Fragmento[]): NotaTienda {
  const fs = unirReferencias(entrada).map((f) => ({ ...f, texto: limpio(f.texto) })).filter((f) => f.texto)
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  if (fs.some((f) => /\bANULADA\b/.test(f.texto))) throw new NotaIlegible("La nota está ANULADA: no se puede importar.");
  const titulo = fs.findIndex((f) => /^Nota de pedido$/i.test(f.texto));
  const numero = titulo >= 0 ? fs.slice(titulo + 1, titulo + 4).map((f) => NUMERO_NOTA.exec(f.texto)?.[1]).find(Boolean) : undefined;
  if (!numero) throw new NotaIlegible("No parece una nota de pedido del cotizador de la tienda (falta «Nota de pedido N.º»).");
  const fabrica = fs.find((f) => /^Fábrica\s+\S+/i.test(f.texto))?.texto.replace(/^Fábrica\s+/i, "");
  if (fabrica && !/panguipulli/i.test(fabrica)) throw new NotaIlegible(`Esta nota es para la fábrica de ${fabrica}, no para Panguipulli.`);

  /** El valor bajo una etiqueta (encabezado de la nota) o a su derecha en la misma línea (bloques de despacho). */
  const debajo = (etiqueta: RegExp) => {
    const e = fs.find((f) => etiqueta.test(f.texto));
    return e ? fs.find((f) => f.pagina === e.pagina && f.y < e.y - MISMA_LINEA && f.y > e.y - 20 && Math.abs(f.x - e.x) < 15)?.texto ?? null : null;
  };
  // El encabezado de la tabla puede repetirse arriba de cada página siguiente: toda línea que lleve «Cant.» es encabezado
  // y no cuenta como ítem, descripción ni «Total» de la nota.
  const cabeceras = fs.filter((f) => /^Cant\.?$/i.test(f.texto));
  const enCabecera = (f: Fragmento) => cabeceras.some((h) => h.pagina === f.pagina && Math.abs(h.y - f.y) <= MISMA_LINEA);
  const derecha = (etiqueta: RegExp, fueraDeCabecera = false) => {
    const e = fs.find((f) => etiqueta.test(f.texto) && !(fueraDeCabecera && enCabecera(f)));
    if (!e) return null;
    const v = fs.filter((f) => f.pagina === e.pagina && Math.abs(f.y - e.y) <= MISMA_LINEA && f.x > e.x + 5).sort((a, b) => a.x - b.x);
    return v.length ? limpio(v.map((f) => f.texto).join(" ")) : null;
  };

  const cabCant = cabeceras[0];
  if (!cabCant || !fs.some((f) => /^Precio f[áa]brica$/i.test(f.texto) && Math.abs(f.y - cabCant.y) <= MISMA_LINEA)) {
    throw new NotaIlegible("No se encontró la tabla de ítems (columnas Cant. y Precio fábrica).");
  }
  const referencias = fs.filter((f) => /^Referencia de cat[áa]logo:/i.test(f.texto));
  const lineas: LineaNota[] = [];
  const avisos: string[] = [];
  for (const [k, r] of referencias.entries()) {
    const codigo = /^Referencia de cat[áa]logo:\s*(\S+)/i.exec(r.texto)?.[1] ?? "";
    if (!CODIGO.test(codigo)) throw new NotaIlegible(`La referencia «${r.texto}» no trae un código del catálogo.`);
    // La línea del ítem es la más cercana por encima con una cantidad en la columna Cant., bajo la referencia del ítem anterior.
    const anterior = referencias[k - 1];
    const techo = Math.min(r.y + LIMITE_FILA, anterior && anterior.pagina === r.pagina ? anterior.y : Infinity);
    const fila = fs.filter((f) => f.pagina === r.pagina && f.y > r.y && f.y < techo && /^\d{1,5}$/.test(f.texto) && Math.abs(f.x - cabCant.x) < TOL_CANTIDAD && !enCabecera(f))
      .sort((a, b) => a.y - b.y)[0];
    if (!fila) throw new NotaIlegible(`No se pudo leer la cantidad del ítem ${codigo}.`);
    const montos = fs.filter((f) => f.pagina === r.pagina && Math.abs(f.y - fila.y) <= MISMA_LINEA && PESOS.test(f.texto)).sort((a, b) => a.x - b.x);
    if (montos.length < 2) throw new NotaIlegible(`No se pudieron leer los precios del ítem ${codigo}.`);
    const columna = fs.filter((f) => f.pagina === r.pagina && Math.abs(f.x - r.x) < 3 && f.y > r.y && f.y <= fila.y + 20 && !enCabecera(f));
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

  // Un pedido especial (fuera de catálogo, precio «Por definir») no trae «Referencia de catálogo»: sin esa ancla no se lee
  // y antes se omitía sin avisar. Una línea de ítem es una cantidad en la columna Cant. con al menos dos importes en su línea.
  const importe = (f: Fragmento) => PESOS.test(f.texto) || /^Por definir$/i.test(f.texto);
  const filasDeItem = fs.filter((f) => /^\d{1,5}$/.test(f.texto) && Math.abs(f.x - cabCant.x) < TOL_CANTIDAD && !enCabecera(f)
    && fs.filter((g) => g.pagina === f.pagina && Math.abs(g.y - f.y) <= MISMA_LINEA && importe(g)).length >= 2);
  const sinCodigo = filasDeItem.length - lineas.length;
  if (sinCodigo > 0) {
    avisos.push(sinCodigo === 1
      ? "La nota trae 1 línea sin «Referencia de catálogo» (pedido especial, precio «Por definir»): no se importa; revísala antes de confirmar."
      : `La nota trae ${sinCodigo} líneas sin «Referencia de catálogo» (pedidos especiales, precio «Por definir»): no se importan; revísalas antes de confirmar.`);
  }

  const neto = derecha(/^Neto$/i);
  const total = derecha(/^Total$/i, true); // no la columna «Total» del encabezado de la tabla, ni las que se repiten
  const suma = lineas.reduce((t, l) => t + l.total, 0);
  if (neto && PESOS.test(neto) && pesos(neto) !== suma) avisos.push(`La suma de los ítems (${suma}) no coincide con el neto de la nota (${pesos(neto)}): revisa si faltan filas.`);
  // Una entrega que no es fecha («15 de noviembre») no se descarta: va a las observaciones, como en la API.
  const entrega = derecha(/^Entrega comprometida$/i);
  const entregaIso = entrega ? isoDesde(entrega) ?? fechaEnPalabras(entrega) : null;
  if (entrega && !entregaIso) avisos.push(`La entrega comprometida de la nota («${entrega}») no es una fecha: pasa a las observaciones del pedido.`);
  return {
    numero,
    // La fecha va alineada a la derecha bajo «Fecha»: la primera en palabras sobre la tabla.
    fecha: fs.filter((f) => f.pagina === cabCant.pagina && f.y > cabCant.y).map((f) => fechaEnPalabras(f.texto)).find(Boolean) ?? null,
    refCotizacion: debajo(/^Cotizaci[óo]n$/i)?.replace(/^N[.°º]{1,2}\s*/, "") ?? null,
    despacho: {
      direccion: derecha(/^Direcci[óo]n de despacho$/i),
      transporte: derecha(/^Transporte$/i),
      proyecto: debajo(/^Despacho$/i),
      entregaComprometida: entregaIso,
      entregaTexto: entrega && !entregaIso ? entrega : null,
    },
    lineas,
    totales: { subtotal: neto && PESOS.test(neto) ? pesos(neto) : null, total: total && PESOS.test(total) ? pesos(total) : null },
    avisos,
  };
}
