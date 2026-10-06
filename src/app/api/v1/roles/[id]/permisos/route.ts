import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { definirPermisosRol } from "@/domain/roles";

const Permisos = z.strictObject({ permisos: z.array(z.string()).max(50) });

// PUT /api/v1/roles/:id/permisos — reemplaza el conjunto de permisos (REQ-ADM-2.2, 2.4)
export const PUT = conPermiso<{ id: string }>("usuarios.gestionar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const { permisos } = Permisos.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => definirPermisosRol(tx, id, permisos, actor, "web")));
});
