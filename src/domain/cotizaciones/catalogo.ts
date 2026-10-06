// Carga del catálogo para el mapeo y del resumen que se entrega a la IA (sin precios, costos ni stock).
import { eq } from "drizzle-orm";
import type { CatalogoResumido } from "@/ai/interfaz";
import type { Tx } from "@/db/conexion";
import { alto, articulo, madera, modelo, rangoAncho } from "@/db/esquema/catalogo";
import type { CatalogoMapeo } from "./mapear";

export async function cargarCatalogoMapeo(tx: Tx): Promise<CatalogoMapeo> {
  const [modelos, maderas, rangos, altos, arts] = await Promise.all([
    tx.select({ id: modelo.id, nombre: modelo.nombre, codigo: modelo.codigo }).from(modelo).where(eq(modelo.familia, "puerta")),
    tx.select({ id: madera.id, nombre: madera.nombre, codigo: madera.codigo }).from(madera),
    tx.select().from(rangoAncho),
    tx.select().from(alto),
    tx.select({ id: articulo.id, codigo: articulo.codigo, m: articulo.modeloId, d: articulo.maderaId, a: articulo.anchoCodigo, h: articulo.altoCodigo })
      .from(articulo).where(eq(articulo.activo, true)),
  ]);
  return {
    modelos, maderas,
    rangos: rangos.map((r) => ({ codigo: r.codigo, etiqueta: r.etiqueta, minM: Number(r.minM), maxM: Number(r.maxM) })),
    altos: altos.map((a) => ({ codigo: a.codigo, altoM: Number(a.altoM) })),
    articulos: new Map(arts.map((x) => [`${x.m}|${x.d}|${x.a}|${x.h}`, { id: x.id, codigo: x.codigo }])),
  };
}

export async function catalogoResumido(tx: Tx): Promise<CatalogoResumido> {
  const [modelos, maderas, rangos, altos, accesorios] = await Promise.all([
    tx.select({ n: modelo.nombre }).from(modelo).where(eq(modelo.familia, "puerta")),
    tx.select({ n: madera.nombre }).from(madera),
    tx.select().from(rangoAncho),
    tx.select().from(alto),
    tx.select({ n: modelo.nombre }).from(modelo).where(eq(modelo.familia, "accesorio")),
  ]);
  return {
    modelos: modelos.map((m) => m.n).sort(), maderas: maderas.map((m) => m.n).sort(),
    anchos: rangos.map((r) => ({ codigo: r.codigo, etiqueta: r.etiqueta })), altosM: altos.map((a) => Number(a.altoM)).sort(),
    accesorios: accesorios.map((a) => a.n).sort(),
  };
}
