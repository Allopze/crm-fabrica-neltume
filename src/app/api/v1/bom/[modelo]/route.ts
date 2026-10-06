import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { definirBom } from "@/domain/bom";

const Definicion = z.strictObject({
  anchoCodigo: z.string().max(10).nullable().optional(),
  altoCodigo: z.string().max(10).nullable().optional(),
  origen: z.enum(["real", "demo"]),
  // Un insumo con su cantidad por puerta, o la madera de la puerta con un factor sobre las pulgadas del artículo (ADR-0012).
  lineas: z.array(z.union([
    z.strictObject({ materiaPrimaId: z.uuid(), cantidad: z.number().positive().max(1e6) }),
    z.strictObject({ maderaPuerta: z.literal(true), cantidad: z.number().positive().max(10) }),
  ])).min(1).max(50),
});

// PUT /api/v1/bom/:modelo — nueva versión del BOM del modelo (y medida opcional) (REQ-MP-3.1–3.4)
export const PUT = conPermiso<{ modelo: string }>("mp.editar", async ({ req, params, actor }) => {
  const d = Definicion.parse(await req.json());
  const b = await bd().transaction((tx) => definirBom(tx, { ...d, modeloCodigo: params.modelo }, actor, "web"));
  return NextResponse.json({ id: b.id }, { status: 201 });
});
