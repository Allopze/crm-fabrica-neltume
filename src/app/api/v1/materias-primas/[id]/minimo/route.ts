import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarMateriaPrima } from "@/domain/materias-primas";

// PATCH /api/v1/materias-primas/:id/minimo — mínimo de reposición; es configuración (REQ-MP-6.2, SECURITY §1)
export const PATCH = conPermiso<{ id: string }>("config.editar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const { stockMinimo } = z.strictObject({ stockMinimo: z.number().min(0).max(1e7).nullable() }).parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => actualizarMateriaPrima(tx, id, { stockMinimo }, actor, "web")));
});
