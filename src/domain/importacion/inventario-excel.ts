// Lectura de la planilla de inventario de la fábrica (hojas «Inventario» y «Despachos»; ADR-0018). Si falta una hoja o
// una columna, aborta; las columnas de importes no se leen.
import ExcelJS from "exceljs";
import { ErrorDominio } from "../errores";
import type { FilaDespacho, FilaInventario } from "./inventario-mapeo";
import { normalizar } from "./mapear";

function valor(v: ExcelJS.CellValue): unknown {
  if (v instanceof Date) return v;
  if (v && typeof v === "object") {
    if ("result" in v) return v.result instanceof Date ? v.result : v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

/** Columna (1…n) de cada encabezado pedido en la fila 1; error si falta alguno. */
function columnas<K extends string>(hoja: ExcelJS.Worksheet, pedidas: Record<K, string>): Record<K, number> {
  const enHoja = new Map<string, number>();
  hoja.getRow(1).eachCell((c, col) => { const n = normalizar(valor(c.value)); if (n && !enHoja.has(n)) enHoja.set(n, col); });
  const faltan = Object.values<string>(pedidas).filter((e) => !enHoja.has(e));
  if (faltan.length) throw new ErrorDominio("VALIDACION", `La hoja «${hoja.name}» no tiene las columnas esperadas.`, { faltan });
  return Object.fromEntries(Object.entries<string>(pedidas).map(([k, e]) => [k, enHoja.get(e)!])) as Record<K, number>;
}

export async function leerInventario(datos: ArrayBuffer): Promise<{ inventario: FilaInventario[]; despachos: FilaDespacho[] }> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorDominio("VALIDACION", "El archivo no es un Excel (.xlsx) válido.");
  }
  const hInv = libro.getWorksheet("Inventario");
  const hDes = libro.getWorksheet("Despachos");
  if (!hInv || !hDes) throw new ErrorDominio("VALIDACION", "Faltan las hojas «Inventario» o «Despachos».");

  const ci = columnas(hInv, { modelo: "MODELO", medida: "MEDIDA", codigo: "CODIGO", madera: "MADERA", produccion: "PRODUCCION", estado: "ESTADO",
    ubicacion: "UBICACION", cliente: "CLIENTE", observaciones: "OBSERVACIONES" });
  const inventario: FilaInventario[] = [];
  hInv.eachRow((fila, n) => {
    if (n === 1) return;
    const c = (k: keyof typeof ci) => valor(fila.getCell(ci[k]).value);
    if (!c("modelo") && !c("codigo")) return;
    inventario.push({ fila: n, modelo: c("modelo"), medida: c("medida"), codigo: c("codigo"), madera: c("madera"), produccion: c("produccion"),
      estado: c("estado"), ubicacion: c("ubicacion"), cliente: c("cliente"), observaciones: c("observaciones") });
  });

  const cd = columnas(hDes, { modelo: "MODELO", medida: "MEDIDA", codigo: "CODIGO", madera: "MADERA", fecha: "FECHA PRODUCCION", estado: "ESTADO",
    cliente: "CLIENTE", documento: "DOCUMENTO" });
  const NOTA = cd.documento + 1; // la nota (OK, PRIMERA, SEGUNDA…) va en la columna siguiente, sin encabezado
  const despachos: FilaDespacho[] = [];
  hDes.eachRow((fila, n) => {
    if (n === 1) return;
    const c = (k: keyof typeof cd) => valor(fila.getCell(cd[k]).value);
    if (!c("modelo") && !c("codigo") && !c("documento")) return;
    despachos.push({ fila: n, modelo: c("modelo"), medida: c("medida"), codigo: c("codigo"), madera: c("madera"), fecha: c("fecha"),
      estado: c("estado"), cliente: c("cliente"), documento: c("documento"), nota: valor(fila.getCell(NOTA).value) });
  });
  return { inventario, despachos };
}
