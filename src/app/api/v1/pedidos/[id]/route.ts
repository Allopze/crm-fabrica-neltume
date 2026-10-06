import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerPedido } from "@/domain/pedidos/consulta";

// GET /api/v1/pedidos/:id — ítems con reservado y faltante (REQ-STK-7.3)
export const GET = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, sesion }) =>
  NextResponse.json(await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver"))));
