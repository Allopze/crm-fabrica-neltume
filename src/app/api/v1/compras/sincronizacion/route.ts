import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ultimaSincronizacion } from "@/domain/compras/consulta";

// GET /api/v1/compras/sincronizacion — última corrida (inicio, fin, resultado y conteos) y petición pendiente (REQ-MP-7.7)
export const GET = conPermiso("stock.ver", async () => NextResponse.json(await ultimaSincronizacion(bd())));
