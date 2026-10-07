import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { CantidadInsumo } from "../esquema";
import { aplicarABoms } from "@/domain/bom";

const Cuerpo = z.strictObject({
  modelos: z.array(z.string().min(1).max(10)).min(1).max(200),
  operacion: z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("factor"), factor: z.number().positive().max(10) }),
    z.strictObject({ tipo: z.literal("insumo"), materiaPrimaId: z.uuid(), cantidad: CantidadInsumo }),
    z.strictObject({ tipo: z.literal("quitar"), materiaPrimaId: z.uuid() }),
  ]),
});

// POST /api/v1/bom/aplicar — un mismo cambio en la receta general de varios modelos (REQ-MP-3.6)
export const POST = conPermiso("mp.editar", async ({ req, actor }) => {
  const d = Cuerpo.parse(await req.json());
  const r = await bd().transaction((tx) => aplicarABoms(tx, d, actor, "web"));
  return NextResponse.json(r);
}, { idempotente: true });
