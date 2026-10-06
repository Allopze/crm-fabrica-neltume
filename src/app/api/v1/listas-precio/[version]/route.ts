import { NextResponse } from "next/server";
import { z } from "zod";
import { conPermiso } from "@/domain/auth/politica";
import { preciosDeLista } from "@/domain/precios/listas";

const Filtro = z.object({
  q: z.string().max(60).optional(), madera: z.enum(["O", "L", "M", "R"]).optional(),
  tipo: z.enum(["BLOQUE", "PANEL", "ESPECIAL"]).optional(), cursor: z.string().max(40).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/listas-precio/:version — precios paginados; costos y margen solo con costos.ver (REQ-COT-1.5)
export const GET = conPermiso<{ version: string }>("stock.ver", async ({ req, params, sesion }) => {
  const version = z.coerce.number().int().positive().parse(params.version);
  const filtro = Filtro.parse(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json(await preciosDeLista(version, filtro, sesion.permisos.has("costos.ver")));
});
