import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearRol, listarRoles } from "@/domain/roles";

const NuevoRol = z.strictObject({ nombre: z.string().max(40), permisos: z.array(z.string()).max(50) });

// GET /api/v1/roles (REQ-ADM-2.x)
export const GET = conPermiso("usuarios.gestionar", async () => NextResponse.json({ datos: await listarRoles(bd()) }));

// POST /api/v1/roles — un perfil nuevo es solo datos (REQ-ADM-2.2)
export const POST = conPermiso("usuarios.gestionar", async ({ req, actor }) => {
  const { nombre, permisos } = NuevoRol.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => crearRol(tx, nombre, permisos, actor, "web")), { status: 201 });
});
