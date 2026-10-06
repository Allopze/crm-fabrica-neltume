import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarMateriaPrima } from "@/domain/materias-primas";

const Cambios = z.strictObject({ activo: z.boolean() });

// PATCH /api/v1/materias-primas/:id — activar o desactivar (REQ-MP-1.3). El mínimo va por /:id/minimo con config.editar.
export const PATCH = conPermiso<{ id: string }>("mp.editar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const c = Cambios.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => actualizarMateriaPrima(tx, id, c, actor, "web")));
});
