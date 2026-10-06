import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { consultarAuditoria } from "@/domain/auditoria-consulta";
import { conPermiso } from "@/domain/auth/politica";

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Filtro = z.object({
  actor: z.uuid().optional(), recurso: z.string().max(40).optional(), accion: z.string().max(80).optional(),
  resultado: z.enum(["ok", "denegado", "error"]).optional(), desde: Fecha.optional(), hasta: Fecha.optional(),
  antesDe: z.coerce.number().int().positive().optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/auditoria — filtros por actor, recurso, acción, resultado y fechas; paginado por id (REQ-ADM-3.2, 3.4)
export const GET = conPermiso("auditoria.ver", async ({ req }) =>
  NextResponse.json(await consultarAuditoria(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)))));
