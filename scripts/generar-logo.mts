// Convierte public/marca/logo-neltume.svg (logo oficial «Puertas Neltume», entregado por la empresa el 13-10-2026) en
// src/lib/logo-trazos.ts, para dibujarlo igual en la web (SVG) y en los PDF (react-pdf). Uso: npx tsx scripts/generar-logo.mts
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("public/marca/logo-neltume.svg", "utf8");
const viewBox = /viewBox="([^"]+)"/.exec(svg)![1];
// Coordenadas redondeadas a 1/2000 del ancho (invisible a cualquier tamaño): el logo va en el JS de cada página.
const decimales = Math.max(0, Math.ceil(Math.log10(2000 / Number(viewBox.trim().split(/[\s,]+/)[2]))));
const compactar = (d: string) =>
  d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (n) => ` ${Number(Number(n).toFixed(decimales))}`)
    .replace(/\s+/g, " ").replace(/ ?([A-Za-z]) ?/g, "$1").trim();
const trazos = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => compactar(m[1]));
const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
// Con trazos que dejan huecos (el marco y los árboles), solo «evenodd» los dibuja calados.
const relleno = /fill-rule="evenodd"/.test(svg) ? "evenodd" : "nonzero";
writeFileSync("src/lib/logo-trazos.ts", `// Generado por scripts/generar-logo.mts desde public/marca/logo-neltume.svg. No editar a mano.
export const LOGO = {
  viewBox: ${JSON.stringify(viewBox)},
  relleno: ${JSON.stringify(relleno)} as "evenodd" | "nonzero",
  trazos: ${JSON.stringify(trazos)},
  rects: ${JSON.stringify(rects)} as [number, number, number, number][],
};
`);
console.log(`✓ src/lib/logo-trazos.ts: ${trazos.length} trazos, ${rects.length} rectángulos, relleno ${relleno}`);
