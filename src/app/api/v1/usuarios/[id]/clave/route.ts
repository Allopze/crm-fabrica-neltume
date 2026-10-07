import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { restablecerClave } from "@/domain/auth/claves";
import { conPermiso } from "@/domain/auth/politica";

const Nueva = z.strictObject({ claveNueva: z.string().min(1).max(200) });

// PUT /api/v1/usuarios/:id/clave — un administrador fija una contraseña nueva y cierra las sesiones (REQ-ADM-2.5)
export const PUT = conPermiso<{ id: string }>("usuarios.gestionar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const { claveNueva } = Nueva.parse(await req.json());
  await bd().transaction((tx) => restablecerClave(tx, id, claveNueva, actor, "web"));
  return new NextResponse(null, { status: 204 });
});
