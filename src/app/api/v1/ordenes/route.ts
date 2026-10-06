import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearOrden, listarOrdenes } from "@/domain/ordenes";

const Nueva = z.strictObject({
  lineas: z.array(z.strictObject({ codigo: z.string().min(3).max(40), cantidad: z.number().int().positive().max(10_000) })).min(1).max(50),
  observacion: z.string().trim().max(300).optional(),
});

// GET /api/v1/ordenes (REQ-MP-4)
export const GET = conPermiso("produccion.gestionar", async () => NextResponse.json({ datos: await listarOrdenes(bd()) }));

// POST /api/v1/ordenes — idempotente (API.md)
export const POST = conPermiso("produccion.gestionar", async ({ req, actor }) => {
  const d = Nueva.parse(await req.json());
  const o = await bd().transaction((tx) => crearOrden(tx, d, actor, "web"));
  return NextResponse.json({ id: o.id, numero: o.numero }, { status: 201 });
}, { idempotente: true });
