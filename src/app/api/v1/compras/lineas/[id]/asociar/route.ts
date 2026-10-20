import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { asociarLinea } from "@/domain/compras/lineas";

const Asociar = z.strictObject({ materiaPrimaId: z.uuid(), factor: z.number().positive().max(1e6) });

// POST /api/v1/compras/lineas/:id/asociar — guarda el mapeo del ítem y recibe sus líneas por asociar (REQ-MP-7.3)
export const POST = conPermiso<{ id: string }>(["mp.mover", "mp.editar"], async ({ req, params, actor }) => {
  const d = Asociar.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => asociarLinea(tx, params.id, d, actor, "web")));
}, { idempotente: true });
