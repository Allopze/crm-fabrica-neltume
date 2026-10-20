// `npm run compras:probar`: comprueba las credenciales de Chipax (.env.compras.local) y que se pueden leer facturas de
// compra y su XML. Solo imprime conteos: ni RUT, ni montos, ni el token (ADR-0021, checkpoint F13).
import { clienteChipax } from "../src/compras/chipax";
import { decodificarXml, leerDte } from "../src/compras/dte";
import { hoySantiago } from "../src/domain/precios/dias-habiles";

const appId = process.env.CHIPAX_APP_ID ?? "";
const secretKey = process.env.CHIPAX_SECRET_KEY ?? "";
if (!appId || !secretKey) {
  console.error("✗ Faltan CHIPAX_APP_ID y CHIPAX_SECRET_KEY en .env.compras.local (copia .env.compras.example).");
  process.exit(1);
}
const dias = Number(process.argv[2] ?? 30);
const hasta = hoySantiago();
const desde = new Date(Date.parse(`${hasta}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
const cliente = clienteChipax({ appId, secretKey, base: process.env.CHIPAX_API_URL || undefined });
try {
  let n = 0;
  let conUrl = 0;
  const urls: string[] = [];
  const tipos = new Map<number, number>();
  for await (const c of cliente.compras(desde, hasta)) {
    n++;
    tipos.set(c.tipo, (tipos.get(c.tipo) ?? 0) + 1);
    if (c.urlXmlPublica) { conUrl++; if (urls.length < 5) urls.push(c.urlXmlPublica); }
  }
  console.log(`✓ Credenciales válidas. Facturas de compra en los últimos ${dias} días: ${n} (${[...tipos].map(([t, k]) => `tipo ${t}: ${k}`).join(", ") || "ninguna"}).`);
  // Hasta 5 XML: los que Chipax aún no sincroniza responden «pendiente» y la corrida los reintenta.
  let leido = false;
  const estados = { ok: 0, pendiente: 0, vencido: 0 };
  for (const url of urls) {
    const x = await cliente.xml(url);
    estados[x.estado]++;
    if (x.estado === "ok" && !leido) {
      leido = true;
      const docs = leerDte(decodificarXml(x.bytes));
      console.log(`✓ XML leído: ${docs.length} documento(s), ${docs.reduce((t, d) => t + d.lineas.length, 0)} línea(s) de detalle, ${docs.flatMap((d) => d.lineas).filter((l) => l.codigo).length} con código de ítem.`);
    }
  }
  if (urls.length) console.log(`· XML de ${urls.length} facturas: ${estados.ok} disponibles, ${estados.pendiente} aún sin sincronizar en Chipax, ${estados.vencido} con URL vencida.`);
  console.log(conUrl < n ? `· ${n - conUrl} sin URL de XML.` : "· Todas traen URL de XML.");
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
}
