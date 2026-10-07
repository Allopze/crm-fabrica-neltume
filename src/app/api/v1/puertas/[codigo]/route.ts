import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { editarPuerta } from "@/domain/puertas/acciones";
import { obtenerPuerta } from "@/domain/puertas/consulta";

// GET /api/v1/puertas/:codigo — ficha con movimientos y despacho histórico (REQ-STK-8.6)
export const GET = conPermiso<{ codigo: string }>("stock.ver", async ({ params, sesion }) =>
  NextResponse.json(await obtenerPuerta(bd(), decodeURIComponent(params.codigo), sesion.permisos.has("clientes.ver"))));

const Cambios = z.strictObject({
  ubicacion: z.string().trim().min(1).max(60).optional(),
  calidad: z.enum(["primera", "segunda"]).optional(),
  observacion: z.string().max(300).nullable().optional(),
});

// PATCH /api/v1/puertas/:codigo — ubicación, calidad u observación; nunca la existencia (REQ-STK-8.4)
export const PATCH = conPermiso<{ codigo: string }>("stock.mover", async ({ req, params, actor, sesion }) => {
  const c = Cambios.parse(await req.json());
  const codigo = decodeURIComponent(params.codigo);
  await bd().transaction((tx) => editarPuerta(tx, codigo, c, actor, "web"));
  return NextResponse.json(await obtenerPuerta(bd(), codigo, sesion.permisos.has("clientes.ver")));
});
