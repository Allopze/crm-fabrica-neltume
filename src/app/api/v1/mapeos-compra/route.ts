import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarMapeos } from "@/domain/compras/proveedores";

// GET /api/v1/mapeos-compra — ítems de cada proveedor y su materia prima con factor, o «no es materia prima» (REQ-MP-7.2)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await listarMapeos(bd()) }));
