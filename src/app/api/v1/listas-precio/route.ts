import { NextResponse } from "next/server";
import { z } from "zod";
import { conPermiso } from "@/domain/auth/politica";
import { crearVersionEditada, listarVersiones } from "@/domain/precios/listas";

const Edicion = z.strictObject({
  cambios: z.array(z.strictObject({ codigo: z.string().min(3).max(40), precioNeto: z.number().positive().max(1e9) })).max(500).optional(),
  recargos: z.array(z.strictObject({ tipo: z.enum(["BLOQUE", "PANEL", "ESPECIAL", "ACCESORIOS"]), porcentaje: z.number().min(0).max(4.99) })).max(4).optional(),
});

// GET /api/v1/listas-precio — versiones (REQ-COT-1.1)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await listarVersiones() }));

// POST /api/v1/listas-precio — nueva versión desde la vigente con cambios de precio o recargo (REQ-COT-1.1, 1.3, 1.4)
export const POST = conPermiso("precios.editar", async ({ req, actor }) => {
  const r = await crearVersionEditada(Edicion.parse(await req.json()), actor);
  return NextResponse.json(r, { status: 201 });
}, { idempotente: true });
