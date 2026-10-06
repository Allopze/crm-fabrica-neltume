import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarUsuario } from "@/domain/usuarios";

const Cambios = z
  .strictObject({ activo: z.boolean().optional(), rolId: z.uuid().optional() })
  .refine((c) => c.activo !== undefined || c.rolId !== undefined, "Indica activo o rolId");

// PATCH /api/v1/usuarios/:id — activar/desactivar o cambiar rol (REQ-ADM-2.1, 2.4)
export const PATCH = conPermiso<{ id: string }>("usuarios.gestionar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const cambios = Cambios.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => actualizarUsuario(tx, id, cambios, actor, "web")));
});
