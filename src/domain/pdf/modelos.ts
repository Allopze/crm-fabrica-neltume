// Modelo y familia del artículo de cada línea, para elegir su dibujo (ADR-0025 D12): una línea «a pedido» no tiene artículo.
import { eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo, modelo } from "@/db/esquema/catalogo";

export type ModeloDeLinea = { modelo: string; familia: "puerta" | "accesorio" };

export async function modelosDeArticulos(tx: Tx, articuloIds: (string | null)[]): Promise<Map<string, ModeloDeLinea>> {
  const ids = [...new Set(articuloIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Map();
  const filas = await tx.select({ id: articulo.id, modelo: modelo.nombre, familia: modelo.familia }).from(articulo)
    .innerJoin(modelo, eq(modelo.id, articulo.modeloId)).where(inArray(articulo.id, ids));
  return new Map(filas.map((f) => [f.id, { modelo: f.modelo, familia: f.familia as ModeloDeLinea["familia"] }]));
}
