import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { habilitarProveedor, listarProveedores } from "@/domain/compras/proveedores";

const Proveedor = z.strictObject({ rut: z.string().trim().min(3).max(15), nombre: z.string().trim().min(1).max(160) });

// GET /api/v1/proveedores-compra — proveedores cuyas facturas se leen de Chipax (REQ-MP-7.1)
export const GET = conPermiso("stock.ver", async () => NextResponse.json({ datos: await listarProveedores(bd()) }));

// POST /api/v1/proveedores-compra — habilita un proveedor desde hoy (REQ-MP-7.1, 7.9)
export const POST = conPermiso("mp.editar", async ({ req, actor }) => {
  const d = Proveedor.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => habilitarProveedor(tx, d, actor, "web")), { status: 201 });
}, { idempotente: true });
