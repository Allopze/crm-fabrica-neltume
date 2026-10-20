import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { solicitarSincronizacion } from "@/domain/compras/proveedores";

// POST /api/v1/compras/sincronizar — «Sincronizar ahora»: una petición para el servicio de compras, una a la vez (REQ-MP-7.7)
export const POST = conPermiso("mp.mover", async ({ actor }) =>
  NextResponse.json(await bd().transaction((tx) => solicitarSincronizacion(tx, actor, "web")), { status: 202 }), { idempotente: true });
