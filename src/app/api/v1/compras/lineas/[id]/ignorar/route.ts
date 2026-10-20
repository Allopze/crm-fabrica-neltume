import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ignorarLinea } from "@/domain/compras/lineas";

// POST /api/v1/compras/lineas/:id/ignorar — «no es materia prima»: queda recordado para el ítem (REQ-MP-7.3)
export const POST = conPermiso<{ id: string }>(["mp.mover", "mp.editar"], async ({ params, actor }) =>
  NextResponse.json(await bd().transaction((tx) => ignorarLinea(tx, params.id, actor, "web"))), { idempotente: true });
