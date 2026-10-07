import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ESTADOS_FILTRO, listarPuertas } from "@/domain/puertas/consulta";

const Filtro = z.object({
  q: z.string().max(60).optional(), ubicacion: z.string().max(60).optional(), calidad: z.enum(["primera", "segunda"]).optional(),
  estado: z.enum(ESTADOS_FILTRO).optional(), articulo: z.string().max(40).optional(), fueraCatalogo: z.enum(["1", "0"]).optional(),
  cursor: z.string().max(40).optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/puertas — puertas con su ubicación, calidad y estado; por defecto, las que están en stock (REQ-STK-8.6)
export const GET = conPermiso("stock.ver", async ({ req, sesion }) => {
  const f = Filtro.parse(Object.fromEntries(req.nextUrl.searchParams));
  const fueraCatalogo = f.fueraCatalogo === undefined ? undefined : f.fueraCatalogo === "1";
  return NextResponse.json(await listarPuertas(bd(), { ...f, fueraCatalogo }, sesion.permisos.has("clientes.ver")));
});
