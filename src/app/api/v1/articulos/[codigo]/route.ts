import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { registrarAuditoria } from "@/domain/auditoria";
import { conPermiso } from "@/domain/auth/politica";
import { articuloPorCodigo } from "@/domain/stock";

const Cambios = z.strictObject({ stockMinimo: z.number().int().min(0).max(100_000).nullable() });

// PATCH /api/v1/articulos/:codigo — mínimo de stock (REQ-STK-6.2, config.editar)
export const PATCH = conPermiso<{ codigo: string }>("config.editar", async ({ req, params, actor }) => {
  const { stockMinimo } = Cambios.parse(await req.json());
  const r = await bd().transaction(async (tx) => {
    const a = await articuloPorCodigo(tx, decodeURIComponent(params.codigo));
    await tx.update(articulo).set({ stockMinimo, actualizadoEn: sql`now()` }).where(eq(articulo.id, a.id));
    await registrarAuditoria(tx, { actor, accion: "definir mínimo", recurso: "articulo", recursoId: a.id, antes: { stockMinimo: a.stockMinimo }, despues: { stockMinimo }, resultado: "ok", origen: "web" });
    return { codigo: a.codigo, stockMinimo };
  });
  return NextResponse.json(r);
});
