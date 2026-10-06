import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { agregarFeriado, feriadosDelAnio } from "@/domain/precios/calendario";
import { hoySantiago } from "@/domain/precios/dias-habiles";

// GET /api/v1/feriados?anio — legales (calculados por ley) y adicionales (REQ-COT-6.6)
export const GET = conPermiso("sesion", async ({ req }) => {
  const anio = z.coerce.number().int().min(2000).max(2100).catch(Number(hoySantiago().slice(0, 4))).parse(req.nextUrl.searchParams.get("anio") ?? undefined);
  return NextResponse.json({ anio, datos: await feriadosDelAnio(bd(), anio) });
});

// POST /api/v1/feriados — feriado adicional (elección, ley puntual); config.editar
export const POST = conPermiso("config.editar", async ({ req, actor }) => {
  const d = z.strictObject({ fecha: z.iso.date(), nombre: z.string().trim().min(3).max(120) }).parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => agregarFeriado(tx, d, actor, "web")), { status: 201 });
});
