// Lectura del libro COTIZADOR (hojas "Precio" y "Categorias"). Un error de estructura aborta todo
// (DATA-MODEL §5); los errores de fila se reportan y no detienen el resto.
import ExcelJS from "exceljs";
import { ErrorDominio } from "../errores";
import { type Categorias, type FilaPrecio, normalizar } from "./mapear";

const ENCABEZADOS = ["CODIGO", "MODELO", "TIPO", "ANCHO", "ESPESOR", "ALTO / LARGO", "MADERA", "PULGADAS"];

/** Valor plano de una celda (resuelve fórmulas, texto enriquecido e hipervínculos). */
function valor(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object") {
    if ("result" in v) return v.result;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if (v instanceof Date) return v.toISOString();
  }
  return v;
}

const clave = (v: unknown) => (typeof v === "number" ? String(Number(v.toFixed(4))) : normalizar(v));

export async function leerLibro(datos: ArrayBuffer): Promise<{ categorias: Categorias; filas: FilaPrecio[] }> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorDominio("VALIDACION", "El archivo no es un Excel (.xlsx) válido.");
  }
  const hojaPrecio = libro.getWorksheet("Precio");
  const hojaCat = libro.getWorksheet("Categorias");
  if (!hojaPrecio || !hojaCat) throw new ErrorDominio("VALIDACION", "Faltan las hojas «Precio» o «Categorias».");

  const encabezado = ENCABEZADOS.map((_, i) => normalizar(valor(hojaPrecio.getRow(2).getCell(i + 1).value)));
  const faltan = ENCABEZADOS.filter((e, i) => encabezado[i] !== e);
  if (faltan.length) throw new ErrorDominio("VALIDACION", "La hoja «Precio» no tiene las columnas esperadas.", { faltan });

  const categorias: Categorias = { modelos: new Map(), anchos: new Map(), altos: new Map() };
  hojaCat.eachRow((fila, n) => {
    if (n < 4) return;
    const celda = (col: string) => valor(fila.getCell(col).value);
    if (celda("C") && celda("D")) categorias.modelos.set(normalizar(celda("C")), normalizar(celda("D")));
    if (celda("R") !== null && celda("R") !== undefined && celda("S") !== null && celda("S") !== undefined) {
      categorias.anchos.set(clave(celda("R")), normalizar(celda("S")));
    }
    if (celda("U") !== null && celda("U") !== undefined && celda("V")) categorias.altos.set(clave(celda("U")), normalizar(celda("V")));
  });
  if (categorias.modelos.size === 0) throw new ErrorDominio("VALIDACION", "La hoja «Categorias» no tiene modelos (columnas C y D).");

  const filas: FilaPrecio[] = [];
  hojaPrecio.eachRow((fila, n) => {
    if (n < 4) return;
    const c = (i: number) => valor(fila.getCell(i).value);
    if (!c(1) && !c(2)) return; // filas vacías o de sección
    if (c(1) && !c(2) && !c(15)) return; // títulos de sección ("PUERTAS PINO OREGON")
    filas.push({
      fila: n, codigo: c(1), modelo: c(2), tipo: c(3), ancho: c(4), espesor: c(5), alto: c(6), madera: c(7), pulgadas: c(8),
      costoProduccion: c(9), costoMateriales: c(10), costoInsumos: c(11), costosGenerales: c(12), costoTotal: c(13), margen: c(14), precioNeto: c(15),
    });
  });
  return { categorias, filas };
}
