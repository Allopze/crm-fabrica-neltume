// Genera e2e/fixtures/cotizador-mini.xlsx y -v2.xlsx con la MISMA estructura que COTIZADOR_2026.xlsx
// (hojas Precio y Categorias) pero con costos ficticios y redondos. Nunca usa datos de datos/ (AGENTS.md).
// Uso: npx tsx scripts/generar-fixtures.mts
import ExcelJS from "exceljs";

const MODELOS: [string, string, "PUERTA BLOQUE" | "PUERTA PANEL" | "PUERTA ESPECIAL"][] = [
  ["NELTUME", "NEL", "PUERTA BLOQUE"], ["ANCACOMOE", "ANC", "PUERTA BLOQUE"], ["MOLCO", "MOL", "PUERTA PANEL"],
  ["LICAN", "LIC", "PUERTA PANEL"], ["FUY", "FUY", "PUERTA PANEL"], ["TOLTEN", "TOLT", "PUERTA ESPECIAL"], ["RANCO", "RAN", "PUERTA ESPECIAL"],
];
const ACCESORIOS: [string, string][] = [["PILASTRA", "PILAST"], ["ENDOLADO", "ENDO"], ["GUARDAPOLVO", "GUARD"], ["MARCO", "MAR"], ["PIEZAS T", "PT"]];
const MADERAS: [string, string][] = [["PINO OREGON", "O"], ["LENGA", "L"], ["MARA", "M"], ["RAULI", "R"]];
const ANCHOS: [string, string][] = [
  ["0,60 A 0,65", "1"], ["0,70 A 0,75", "2"], ["0,80 A 0,85", "3"], ["0,90 A 0,95", "4"], ["1,00 A 1,05", "5"],
  ["1,10 A 1,15", "6"], ["1,20 A 1,25", "7"], ["1,30 A 1,35", "8"], ["1,40 A 1,45", "9"],
  ["2x4", "2x4"], ["2x5", "2x5"], ["2x6", "2x6"], ["2x8", "2x8"],
];
const ALTOS: [number, string][] = [[2, "A"], [2.1, "B"], [2.2, "C"], [2.3, "D"], [2.4, "E"], [2.5, "F"], [2.6, "G"], [3, "H"]];
// Variantes incluidas: [modelo, ancho, alto] para las 4 maderas.
const VARIANTES: [string, string, number][] = [];
for (const [, cod] of MODELOS) for (const a of ["3", "4"]) VARIANTES.push([cod, a, 2.1]);
VARIANTES.push(["TOLT", "4", 2.2], ["FUY", "2", 2], ["ANC", "3", 2]);

async function generar(destino: string, factor: number) {
  const libro = new ExcelJS.Workbook();
  const precio = libro.addWorksheet("Precio");
  precio.getCell("A1").value = "LISTA DE PRECIOS PUERTAS NELTUME (FICTICIA, SOLO PRUEBAS)";
  precio.getRow(2).values = ["CODIGO", "MODELO", "TIPO", "ANCHO", "ESPESOR", "ALTO / LARGO", "MADERA", "PULGADAS",
    "COSTO PRODUCCION [$/PUERTA]", "COSTO MATERIALES [$/PUERTA]", "COSTO INSUMOS [$/PUERTA]", "COSTOS GENERALES [$/PUERTA]",
    "COSTO TOTAL [$/PUERTA]", "MARGEN", "PRECIO  VALOR NETO", "PRECIO  VALOR CON IVA"];
  precio.getCell("A3").value = "PUERTAS (FICTICIAS)";

  let fila = 4;
  const etiquetaAncho = (cod: string) => ANCHOS.find(([, c]) => c === cod)![0];
  const letraAlto = (m: number) => ALTOS.find(([a]) => a === m)![1];
  MADERAS.forEach(([madera, mc], im) => {
    for (const [cod, ancho, alto] of VARIANTES) {
      const [nombre, , tipo] = MODELOS.find(([, c]) => c === cod)!;
      // factor escala costo y precio juntos: el importador exige neto = costo × (1 + margen).
      const costo = Math.round((100_000 + Number(ancho) * 10_000 + im * 15_000 + Math.round((alto - 2) * 50_000)) * factor);
      const margen = tipo === "PUERTA ESPECIAL" ? 0.3 : 0.2;
      const neto = Math.round(costo * (1 + margen));
      precio.getRow(fila++).values = [`${cod}-${mc}-${ancho}-${letraAlto(alto)}`, nombre, tipo, etiquetaAncho(ancho), null, alto, madera,
        5, costo * 0.25, costo * 0.5, costo * 0.1, costo * 0.15, costo, margen, neto, Math.round(neto * 1.19)];
    }
  });
  // Un accesorio: marco de 4 pulgadas para 2,10 m.
  const costoMarco = Math.round(15_000 * factor);
  precio.getRow(fila++).values = ["MAR-O-2X4-B", "MARCO", "", 4, null, 2.1, "PINO OREGON", 1.3, null, null, null, null, costoMarco, 0.3, Math.round(costoMarco * 1.3), Math.round(costoMarco * 1.3 * 1.19)];
  // Fila inválida a propósito: el código no coincide con el alto (como LLAG-O-2-A en el Excel real).
  precio.getRow(fila++).values = ["NEL-O-3-B", "NELTUME", "PUERTA BLOQUE", "0,80 A 0,85", null, 2.2, "PINO OREGON", 5, 30_000, 60_000, 12_000, 18_000, 120_000, 0.2, 144_000, 171_360];

  const cat = libro.addWorksheet("Categorias");
  cat.getCell("C3").value = "MODELOS";
  [...MODELOS.map(([n, c]) => [n, c] as const), ...ACCESORIOS].forEach(([n, c], i) => {
    cat.getCell(`C${4 + i}`).value = n;
    cat.getCell(`D${4 + i}`).value = c;
  });
  cat.getCell("G3").value = "MADERA";
  ["PINO OREGON", "LENGA", "MARA", "RAULÍ"].forEach((m, i) => (cat.getCell(`G${4 + i}`).value = m));
  cat.getCell("R3").value = "ANCHO";
  ANCHOS.forEach(([e, c], i) => { cat.getCell(`R${4 + i}`).value = e; cat.getCell(`S${4 + i}`).value = /^\d$/.test(c) ? Number(c) : c; });
  cat.getCell("U3").value = "ALTO";
  ALTOS.forEach(([a, l], i) => { cat.getCell(`U${4 + i}`).value = a; cat.getCell(`V${4 + i}`).value = l; });

  await libro.xlsx.writeFile(destino);
  console.log(`✓ ${destino}: ${fila - 4} filas de precio`);
}

await generar("e2e/fixtures/cotizador-mini.xlsx", 1);
await generar("e2e/fixtures/cotizador-mini-v2.xlsx", 1.1);
