// `npm run compras:proveedores -- [--dias N] "Nombre 1" "Nombre 2"…`: busca en las facturas de compra de Chipax los
// emisores cuyo nombre coincide, para habilitarlos por RUT en Materias primas → Compras (ADR-0021). Solo lectura: no
// escribe en la BD y solo imprime RUT y razón social de los emisores (sin montos ni el token).
import { clienteChipax } from "../src/compras/chipax";
import { formatearRut } from "../src/domain/rut";
import { hoySantiago } from "../src/domain/precios/dias-habiles";

const appId = process.env.CHIPAX_APP_ID ?? "";
const secretKey = process.env.CHIPAX_SECRET_KEY ?? "";
if (!appId || !secretKey) {
  console.error("✗ Faltan CHIPAX_APP_ID y CHIPAX_SECRET_KEY en .env.compras.local (copia .env.compras.example).");
  process.exit(1);
}
const args = process.argv.slice(2);
const iDias = args.indexOf("--dias");
const dias = iDias >= 0 ? Number(args.splice(iDias, 2)[1]) : 365;
const buscados = args.filter(Boolean);

// Sin tildes, puntuación ni la forma societaria: «Ferretería Jaramillo Ltda.» ≈ «ferreteria jaramillo».
const SOCIETARIA = /\b(spa|s\.?p\.?a|ltda|limitada|s\.?a|eirl|e\.?i\.?r\.?l|y cia|cia)\b/g;
const plano = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N} ]+/gu, " ").replace(SOCIETARIA, " ").replace(/\s+/g, " ").trim();
const palabras = (t: string) => plano(t).split(" ").filter((p) => p.length > 2 && !["del", "los", "las", "para", "con"].includes(p));

const hasta = hoySantiago();
const desde = new Date(Date.parse(`${hasta}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
const cliente = clienteChipax({ appId, secretKey, base: process.env.CHIPAX_API_URL || undefined });
try {
  const emisores = new Map<string, { razon: string; facturas: number; ultima: string }>();
  for await (const c of cliente.compras(desde, hasta)) {
    const e = emisores.get(c.rutEmisor) ?? { razon: c.razonSocial, facturas: 0, ultima: "" };
    e.facturas++;
    if (c.fechaEmision > e.ultima) e.ultima = c.fechaEmision;
    emisores.set(c.rutEmisor, e);
  }
  console.log(`Emisores con facturas de compra en los últimos ${dias} días: ${emisores.size}.`);
  const fila = (rut: string, e: { razon: string; facturas: number; ultima: string }) =>
    `    ${formatearRut(rut).padEnd(13)} ${e.razon} · ${e.facturas} factura(s), la última del ${e.ultima.split("-").reverse().join("-")}`;
  if (!buscados.length) for (const [rut, e] of [...emisores].sort((a, b) => a[1].razon.localeCompare(b[1].razon))) console.log(fila(rut, e));
  for (const b of buscados) {
    const p = palabras(b);
    // Coincide si todas las palabras significativas del nombre buscado están en la razón social.
    const hallados = [...emisores].filter(([, e]) => { const r = ` ${plano(e.razon)} `; return p.every((w) => r.includes(` ${w}`)); });
    console.log(`\n«${b}»: ${hallados.length ? `${hallados.length} coincidencia(s)` : "sin coincidencias"}`);
    for (const [rut, e] of hallados) console.log(fila(rut, e));
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
}
