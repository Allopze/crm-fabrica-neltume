import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { anularOrden } from "@/domain/ordenes";

// POST /api/v1/ordenes/:id/anular — solo órdenes abiertas
export const POST = conPermiso<{ id: string }>("produccion.gestionar", async ({ params, actor }) => {
  const id = z.uuid().parse(params.id);
  await bd().transaction((tx) => anularOrden(tx, id, actor, "web"));
  return new NextResponse(null, { status: 204 });
}, { idempotente: true });
