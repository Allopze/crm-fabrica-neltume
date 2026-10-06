import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { actualizarDespacho } from "@/domain/pedidos/ciclo";
import { obtenerPedido } from "@/domain/pedidos/consulta";

// GET /api/v1/pedidos/:id — ítems con reservado y faltante (REQ-STK-7.3)
export const GET = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, sesion }) =>
  NextResponse.json(await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver"))));

const Despacho = z.strictObject({
  direccionDespacho: z.string().trim().max(300).nullable().optional(),
  medioTransporte: z.string().trim().max(120).nullable().optional(),
  entregaComprometida: z.iso.date().nullable().optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
});

// PATCH /api/v1/pedidos/:id — despacho, entrega comprometida y observaciones mientras el pedido siga abierto
export const PATCH = conPermiso<{ id: string }>("pedidos.gestionar", async ({ req, params, actor, sesion }) => {
  const d = Despacho.parse(await req.json());
  await bd().transaction((tx) => actualizarDespacho(tx, params.id, d, actor, "web"));
  return NextResponse.json(await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
