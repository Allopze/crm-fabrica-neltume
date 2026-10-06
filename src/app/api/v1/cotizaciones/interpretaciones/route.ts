import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearInterpretacion } from "@/domain/cotizaciones/interpretacion";

const Pedido = z.strictObject({ texto: z.string().max(20_000), clienteId: z.uuid().nullable().optional() });

// POST /api/v1/cotizaciones/interpretaciones — 202: el worker interpreta en segundo plano (REQ-COT-2.1, 2.10; ADR-0006)
export const POST = conPermiso("cotizaciones.crear", async ({ req, actor }) => {
  const d = Pedido.parse(await req.json());
  const c = await bd().transaction((tx) => crearInterpretacion(tx, d, actor, "web"));
  return NextResponse.json(c, { status: 202 });
}, { idempotente: true });
