import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { marcarLista } from "@/domain/pedidos/ciclo";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";

// POST /api/v1/pedidos/:id/lista — lista para despacho: todo reservado y los ítems a pedido confirmados (REQ-COT-8.5)
export const POST = conPermiso<{ id: string }>("pedidos.gestionar", async ({ req, params, actor, sesion }) => {
  const { confirmarAPedido } = z.strictObject({ confirmarAPedido: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));
  await bd().transaction((tx) => marcarLista(tx, params.id, confirmarAPedido, actor, "web"));
  return NextResponse.json(await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos)));
}, { idempotente: true });
