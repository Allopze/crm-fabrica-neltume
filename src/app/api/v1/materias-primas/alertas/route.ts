import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { materiasParaReponer } from "@/domain/alertas";
import { conPermiso } from "@/domain/auth/politica";

// GET /api/v1/materias-primas/alertas — materias primas bajo su mínimo, con lo que falta (REQ-MP-6.1)
export const GET = conPermiso("stock.ver", async () =>
  NextResponse.json({ datos: (await materiasParaReponer(bd())).sort((a, b) => b.faltan / b.minimo - a.faltan / a.minimo) }));
