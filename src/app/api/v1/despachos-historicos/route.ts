import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarHistorico } from "@/domain/puertas/consulta";

const Filtro = z.object({
  q: z.string().max(60).optional(), codigo: z.string().max(40).optional(), cursor: z.string().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/despachos-historicos — despachos de la planilla anterior a la app; el cliente, solo con clientes.ver (REQ-STK-10.2)
export const GET = conPermiso("stock.ver", async ({ req, sesion }) =>
  NextResponse.json(await listarHistorico(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)), sesion.permisos.has("clientes.ver"))));
