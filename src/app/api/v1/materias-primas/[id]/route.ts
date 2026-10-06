import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarMateriaPrima } from "@/domain/materias-primas";

const Cambios = z.strictObject({ stockMinimo: z.number().min(0).max(1e7).nullable().optional(), activo: z.boolean().optional() });

// PATCH /api/v1/materias-primas/:id — mínimo o activo (REQ-MP-1.3, 6.2)
export const PATCH = conPermiso<{ id: string }>("mp.editar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const c = Cambios.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => actualizarMateriaPrima(tx, id, c, actor, "web")));
});
