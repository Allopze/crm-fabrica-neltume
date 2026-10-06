import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarCliente, obtenerCliente } from "@/domain/clientes";
import { ErrorDominio } from "@/domain/errores";
import { Cliente } from "../esquema";

const idValido = (id: string) => {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado");
  return r.data;
};

// GET /api/v1/clientes/:id (REQ-COT-9.3)
export const GET = conPermiso<{ id: string }>("clientes.ver", async ({ params }) => NextResponse.json(await obtenerCliente(bd(), idValido(params.id))));

// PATCH /api/v1/clientes/:id (REQ-COT-9.1)
export const PATCH = conPermiso<{ id: string }>("clientes.editar", async ({ req, params, actor }) => {
  const d = Cliente.partial().parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => actualizarCliente(tx, idValido(params.id), d, actor, "web")));
});
