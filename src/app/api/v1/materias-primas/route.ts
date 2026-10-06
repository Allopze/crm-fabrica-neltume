import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearMateriaPrima, listarMateriasPrimas } from "@/domain/materias-primas";

const Nueva = z.strictObject({
  nombre: z.string().min(2).max(120),
  unidadCodigo: z.string().min(1).max(10),
  stockMinimo: z.number().min(0).max(1e7).nullable().optional(),
});

// GET /api/v1/materias-primas — con existencias (REQ-MP-1)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await listarMateriasPrimas(bd()) }));

// POST /api/v1/materias-primas (REQ-MP-1.1–1.3)
export const POST = conPermiso("mp.editar", async ({ req, actor }) => {
  const d = Nueva.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => crearMateriaPrima(tx, d, actor, "web")), { status: 201 });
});
