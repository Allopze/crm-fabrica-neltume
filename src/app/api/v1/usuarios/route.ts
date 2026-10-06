import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { LARGO_MINIMO_CLAVE } from "@/domain/auth/reglas";
import { crearUsuario, listarUsuarios } from "@/domain/usuarios";

const NuevoUsuario = z.strictObject({
  email: z.string().max(254),
  nombre: z.string().min(1).max(120),
  clave: z.string().min(LARGO_MINIMO_CLAVE).max(200),
  rolId: z.uuid(),
});

// GET /api/v1/usuarios (REQ-ADM-2.1)
export const GET = conPermiso("usuarios.gestionar", async () => NextResponse.json({ datos: await listarUsuarios(bd()) }));

// POST /api/v1/usuarios (REQ-ADM-2.1)
export const POST = conPermiso("usuarios.gestionar", async ({ req, actor }) => {
  const datos = NuevoUsuario.parse(await req.json());
  const u = await bd().transaction((tx) => crearUsuario(tx, datos, actor, "web"));
  return NextResponse.json(u, { status: 201 });
});
