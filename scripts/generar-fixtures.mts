// Genera e2e/fixtures/cotizador-mini.xlsx y -v2.xlsx (estructura del Excel real, datos ficticios; tests/fixtures/excel-ficticio.ts).
// Uso: npx tsx scripts/generar-fixtures.mts
import { writeFileSync } from "node:fs";
import { generarLibro, variantesMini } from "../tests/fixtures/excel-ficticio";

for (const [destino, factor] of [["e2e/fixtures/cotizador-mini.xlsx", 1], ["e2e/fixtures/cotizador-mini-v2.xlsx", 1.1]] as const) {
  const { buffer, filas } = await generarLibro({ factor, variantes: variantesMini(), extrasMini: true });
  writeFileSync(destino, Buffer.from(buffer));
  console.log(`✓ ${destino}: ${filas} filas de precio`);
}
