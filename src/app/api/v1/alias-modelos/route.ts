import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { agregarAlias, listarAlias } from "@/domain/cotizaciones/alias";

// GET /api/v1/alias-modelos — nombres alternativos de modelos (REQ-COT-2.11)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await listarAlias(bd()) }));

// POST /api/v1/alias-modelos — agrega o cambia un alias (catalogo.editar)
export const POST = conPermiso("catalogo.editar", async ({ req, actor }) => {
  const d = z.strictObject({ alias: z.string().trim().min(3).max(60), modelo: z.string().trim().min(2).max(60), tipo: z.enum(["seguro", "posible"]) }).parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => agregarAlias(tx, d, actor, "web")), { status: 201 });
});
