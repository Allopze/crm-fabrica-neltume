// `npx tsx --env-file-if-exists=.env.local scripts/importar-excel.mts <archivo.xlsx>` (en producción:
// `docker compose run --rm -T -v /ruta/cotizador.xlsx:/tmp/cotizador.xlsx:ro migrar npx tsx scripts/importar-excel.mts /tmp/cotizador.xlsx`):
// importa las hojas Precio y Categorias del cotizador como catálogo y lista de precios, igual que Precios → Importar
// (REQ-STK-1.1–1.3, 1.6). Idempotente. Audita a nombre del primer administrador. No imprime costos ni precios.
import { readFileSync } from "node:fs";
import { asc } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { usuario } from "../src/db/esquema/seguridad";
import { importarExcel } from "../src/domain/importacion/importar";

const archivo = process.argv[2];
try {
  if (!archivo) throw new Error("Uso: scripts/importar-excel.mts <archivo.xlsx>");
  const [admin] = await bd().select().from(usuario).orderBy(asc(usuario.creadoEn)).limit(1);
  if (!admin) throw new Error("Crea primero un usuario con `npm run crear-admin`.");
  const b = readFileSync(archivo);
  const r = await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, archivo.split("/").at(-1)!, { tipo: "usuario", id: admin.id });
  if (r.repetida) console.log(`= Este archivo ya estaba importado (lista v${r.listaVersion ?? "—"}).`);
  else console.log(`✓ Lista v${r.listaVersion ?? "—"}: ${r.creadas} artículos creados, ${r.actualizadas} actualizados, ${r.sinCambios} sin cambios, ${r.rechazadas} filas rechazadas, ${r.correcciones.length} corregidas.`);
  for (const x of r.rechazos.slice(0, 20)) console.log(`  ✗ fila ${x.fila}: ${x.motivo}`);
  if (r.rechazos.length > 20) console.log(`  … y ${r.rechazos.length - 20} rechazos más.`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
