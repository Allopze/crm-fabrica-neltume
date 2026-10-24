import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { completarReserva } from "@/domain/pedidos/completar";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";

// POST /api/v1/pedidos/:id/completar-reserva — reserva el faltante con el stock disponible ahora (REQ-STK-7.5)
export const POST = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, actor, sesion }) => {
  const r = await bd().transaction((tx) => completarReserva(tx, params.id, actor, "web"));
  return NextResponse.json({ ...r, pedido: await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos)) });
}, { idempotente: true });
