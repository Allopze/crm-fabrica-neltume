import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarCotizaciones } from "@/domain/cotizaciones/consulta";
import { crearManual } from "@/domain/cotizaciones/manual";

const Filtro = z.object({
  estado: z.enum(["interpretando", "borrador", "ia_fallida", "aprobada", "aceptada", "vencida"]).optional(),
  q: z.string().max(80).optional(), antesDe: z.coerce.number().int().positive().optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/cotizaciones — lista paginada por número (REQ-COT-10.1)
export const GET = conPermiso("cotizaciones.crear", async ({ req, sesion }) =>
  NextResponse.json(await listarCotizaciones(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)), sesion.permisos.has("clientes.ver"))));

const Cantidad = z.number().int().min(1).max(999);
const Manual = z.strictObject({
  clienteId: z.uuid().nullable().optional(),
  items: z.array(z.union([
    z.strictObject({ codigo: z.string().trim().min(1).max(40), cantidad: Cantidad }),
    z.strictObject({ detalle: z.string().trim().min(1).max(200), cantidad: Cantidad }),
  ])).min(1).max(100),
});

// POST /api/v1/cotizaciones — cotización manual con el mismo cálculo que la de IA (REQ-COT-5.1–5.3)
export const POST = conPermiso("cotizaciones.crear", async ({ req, actor }) => {
  const d = Manual.parse(await req.json());
  const c = await bd().transaction((tx) => crearManual(tx, d, actor, "web"));
  return NextResponse.json(c, { status: 201 });
}, { idempotente: true });
