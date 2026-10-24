import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { datosTienda } from "@/domain/integracion-tienda/consulta";
import { actualizarDespacho } from "@/domain/pedidos/ciclo";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";

// GET /api/v1/pedidos/:id — ítems con reservado y faltante (REQ-STK-7.3); importes solo con pedidos.importes.ver y, si
// llegó por la API de la tienda, su revisión, documentos y revisiones pendientes (ADR-0023)
export const GET = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, sesion }) => {
  const vista = vistaDe(sesion.permisos);
  const p = await obtenerPedido(bd(), params.id, vista);
  return NextResponse.json({ ...p, tienda: await datosTienda(bd(), p.id, vista) });
});

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
  return NextResponse.json(await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos)));
});
