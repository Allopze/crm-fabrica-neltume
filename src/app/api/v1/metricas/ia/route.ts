import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { metricasIa } from "@/domain/metricas-ia";

// GET /api/v1/metricas/ia — latencia, costo, fallas y alertas de gasto (DESIGN §5, SECURITY T4)
export const GET = conPermiso("auditoria.ver", async () => NextResponse.json(await metricasIa(bd())));
