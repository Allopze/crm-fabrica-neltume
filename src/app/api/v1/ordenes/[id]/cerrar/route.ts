import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { cerrarOrden } from "@/domain/ordenes";

const Cierre = z.strictObject({
  consumosManuales: z.array(z.strictObject({ materiaPrimaId: z.uuid(), cantidad: z.number().positive().max(1e7) })).max(50).optional(),
  ubicacion: z.string().trim().min(1).max(60).optional(), // dónde quedan las puertas terminadas (por defecto, Fábrica)
});

// POST /api/v1/ordenes/:id/cerrar — consumo + entrada, todo o nada; responde los códigos de las puertas nuevas (REQ-MP-4.1–4.5, REQ-STK-8.2)
export const POST = conPermiso<{ id: string }>("produccion.gestionar", async ({ req, params, actor }) => {
  const id = z.uuid().parse(params.id);
  const { consumosManuales = [], ubicacion } = Cierre.parse(await req.json().catch(() => ({})));
  const clave = req.headers.get("idempotency-key") ?? undefined;
  return NextResponse.json(await bd().transaction((tx) => cerrarOrden(tx, id, consumosManuales, actor, "web", clave, { ubicacion })));
}, { idempotente: true });
