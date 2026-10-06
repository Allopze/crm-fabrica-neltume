import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { despachar } from "@/domain/pedidos/ciclo";
import { obtenerPedido } from "@/domain/pedidos/consulta";

// POST /api/v1/pedidos/:id/despachar — libera la reserva y descuenta el stock, todo o nada (REQ-STK-4.4)
export const POST = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, actor, sesion }) => {
  await bd().transaction((tx) => despachar(tx, params.id, actor, "web"));
  return NextResponse.json(await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver")));
}, { idempotente: true });
