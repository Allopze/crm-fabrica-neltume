import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarCotizaciones } from "@/domain/cotizaciones/consulta";

const Filtro = z.object({
  estado: z.enum(["interpretando", "borrador", "ia_fallida", "aprobada", "aceptada", "vencida"]).optional(),
  q: z.string().max(80).optional(), antesDe: z.coerce.number().int().positive().optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/cotizaciones — lista paginada por número (REQ-COT-10.1)
export const GET = conPermiso("cotizaciones.crear", async ({ req }) =>
  NextResponse.json(await listarCotizaciones(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)))));
