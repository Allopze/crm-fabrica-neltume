import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerPedido } from "@/domain/pedidos/consulta";
import { cancelarPedido } from "@/domain/pedidos/pedidos";

// POST /api/v1/pedidos/:id/cancelar — libera las reservas con movimientos (REQ-STK-7.2, 7.4)
export const POST = conPermiso<{ id: string }>("pedidos.gestionar", async ({ req, params, actor, sesion }) => {
  const { motivo } = z.strictObject({ motivo: z.string().trim().min(1).max(300) }).parse(await req.json());
  await bd().transaction((tx) => cancelarPedido(tx, params.id, motivo, actor, "web"));
  return NextResponse.json(await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver")));
}, { idempotente: true });
