import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { buscarClientes, crearCliente } from "@/domain/clientes";
import { Cliente } from "./esquema";

const Filtro = z.object({ q: z.string().max(80).optional(), cursor: z.string().max(160).optional(), limite: z.coerce.number().int().min(1).max(200).optional() });

// GET /api/v1/clientes (REQ-COT-9.3)
export const GET = conPermiso("clientes.ver", async ({ req }) =>
  NextResponse.json(await buscarClientes(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)))));

// POST /api/v1/clientes — RUT validado (REQ-COT-9.1, 9.2)
export const POST = conPermiso("clientes.editar", async ({ req, actor }) => {
  const d = Cliente.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => crearCliente(tx, d, actor, "web")), { status: 201 });
});
