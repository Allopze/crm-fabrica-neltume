import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { asociarMaderaInsumo } from "@/domain/bom";

const Cuerpo = z.strictObject({ materiaPrimaId: z.uuid().nullable() });

// PUT /api/v1/maderas/:codigo/insumo — materia prima de la que se descuenta la madera de la puerta (REQ-MP-3.5, ADR-0012)
export const PUT = conPermiso<{ codigo: string }>("mp.editar", async ({ req, params, actor }) => {
  const { materiaPrimaId } = Cuerpo.parse(await req.json());
  await bd().transaction((tx) => asociarMaderaInsumo(tx, params.codigo, materiaPrimaId, actor, "web"));
  return new NextResponse(null, { status: 204 });
});
