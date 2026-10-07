// `npm run cargar-inventario -- <archivo.xlsx> [--simular] [--agregar]` (en producción:
// `docker compose run --rm migrar npx tsx scripts/cargar-inventario.mts <archivo>`): carga la planilla de inventario
// de la fábrica (hojas Inventario y Despachos) como puertas con código e historial de despachos (ADR-0018, REQ-STK-9, 10).
// Idempotente. --simular deshace todo al final y solo muestra el informe. No imprime precios ni nombres de clientes.
import { readFileSync } from "node:fs";
import { asc } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { usuario } from "../src/db/esquema/seguridad";
import { ErrorDominio } from "../src/domain/errores";
import { cargarInventario, type InformeInventario } from "../src/domain/importacion/inventario-carga";
import { leerInventario } from "../src/domain/importacion/inventario-excel";
import { hoySantiago } from "../src/domain/puertas/normalizar";

class Simulacion extends Error {}

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const simular = args.includes("--simular");
const agregar = args.includes("--agregar");

const lista = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => `    ${k}: ${n}`).join("\n");

function imprimir(i: InformeInventario) {
  const p = i.puertas;
  console.log(`\nPuertas (hoja Inventario): ${p.leidas} filas`);
  console.log(`  cargadas ${p.cargadas} · ya existían ${p.yaExistian} · no cargadas ${i.rechazos.length}`);
  console.log(`  del catálogo ${p.catalogo} · fuera de catálogo ${p.fueraCatalogo} · de segunda ${p.segunda} · apartadas ${p.apartadas} · con código nuevo ${p.codigosNuevos}`);
  if (Object.keys(i.fueraPorMotivo).length) console.log(`  fuera de catálogo por motivo:\n${lista(i.fueraPorMotivo)}`);
  if (Object.keys(i.porUbicacion).length) console.log(`  por ubicación:\n${lista(i.porUbicacion)}`);
  console.log(`  creados: ${i.creados.articulos} artículos fuera de catálogo; modelos: ${i.creados.modelos.join(", ") || "—"}; maderas: ${i.creados.maderas.join(", ") || "—"}`);
  for (const r of i.rechazos) console.log(`  ✗ fila ${r.fila}: ${r.motivo}`);
  for (const d of i.dudas) console.log(`  ? ${d.hoja} fila ${d.fila}: ${d.detalle}`);
  const h = i.historico;
  console.log(`\nHistorial (hoja Despachos): ${h.leidas} filas · cargadas ${h.cargadas} · ya existían ${h.yaExistian} · dudosas ${h.dudosas}`);
  if (Object.keys(h.porEstado).length) console.log(`  por estado:\n${lista(h.porEstado)}`);
}

try {
  if (!archivo) throw new Error("Uso: npm run cargar-inventario -- <archivo.xlsx> [--simular] [--agregar]");
  const b = readFileSync(archivo);
  const libro = await leerInventario(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const [admin] = await bd().select().from(usuario).orderBy(asc(usuario.creadoEn)).limit(1);
  if (!admin) throw new Error("Crea primero un usuario con `npm run crear-admin`.");
  let informe: InformeInventario | undefined;
  try {
    await bd().transaction(async (tx) => {
      informe = await cargarInventario(tx, libro, { tipo: "usuario", id: admin.id }, "consola", { agregar, hoy: hoySantiago() });
      if (simular) throw new Simulacion(); // deshace la transacción
    });
  } catch (e) {
    if (!(e instanceof Simulacion)) throw e;
  }
  imprimir(informe!);
  console.log(simular ? "\nSimulación: no se guardó nada." : "\n✓ Inventario cargado.");
} catch (e) {
  console.error(e instanceof ErrorDominio || e instanceof Error ? `✗ ${e.message}` : e);
  if (e instanceof ErrorDominio && e.detalles) console.error(e.detalles);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
