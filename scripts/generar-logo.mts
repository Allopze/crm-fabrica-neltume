// Convierte public/marca/logo-neltume.svg (logo oficial, extraído del Excel de la empresa) en src/lib/logo-trazos.ts,
// para dibujarlo igual en la web (SVG) y en los PDF (react-pdf). Uso: npx tsx scripts/generar-logo.mts
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("public/marca/logo-neltume.svg", "utf8");
const viewBox = /viewBox="([^"]+)"/.exec(svg)![1];
const trazos = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
writeFileSync("src/lib/logo-trazos.ts", `// Generado por scripts/generar-logo.mts desde public/marca/logo-neltume.svg. No editar a mano.
export const LOGO = {
  viewBox: ${JSON.stringify(viewBox)},
  trazos: ${JSON.stringify(trazos)},
  rects: ${JSON.stringify(rects)} as [number, number, number, number][],
};
`);
console.log(`✓ src/lib/logo-trazos.ts: ${trazos.length} trazos, ${rects.length} rectángulos`);
