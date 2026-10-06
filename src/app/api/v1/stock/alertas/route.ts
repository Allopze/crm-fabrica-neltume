import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { puertasBajoMinimo } from "@/domain/alertas";
import { conPermiso } from "@/domain/auth/politica";

// GET /api/v1/stock/alertas — puertas con disponible bajo su mínimo, las que más faltan primero (REQ-STK-6.1)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await puertasBajoMinimo(bd()) }));
