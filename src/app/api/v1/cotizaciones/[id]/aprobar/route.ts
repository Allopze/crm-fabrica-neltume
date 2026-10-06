import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { aprobarCotizacion } from "@/domain/cotizaciones/aprobacion";

// POST /api/v1/cotizaciones/:id/aprobar — 409 ITEMS_POR_CONFIRMAR si quedan pendientes (REQ-COT-3.3, 4.1, 4.5)
export const POST = conPermiso<{ id: string }>("cotizaciones.aprobar", async ({ req, params, actor }) => {
  const { version } = z.strictObject({ version: z.number().int().positive() }).parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => aprobarCotizacion(tx, params.id, version, actor, "web")));
}, { idempotente: true });
