import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { despachar } from "@/domain/pedidos/ciclo";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";

const Despacho = z.strictObject({ puertas: z.array(z.string().trim().min(3).max(40)).max(2000).optional() });

// POST /api/v1/pedidos/:id/despachar — libera la reserva y descuenta el stock puerta por puerta, todo o nada.
// Sin `puertas` (o sin las de un artículo) salen las más antiguas no apartadas (REQ-STK-4.4, 8.3).
export const POST = conPermiso<{ id: string }>("pedidos.gestionar", async ({ req, params, actor, sesion }) => {
  const { puertas = [] } = Despacho.parse(await req.json().catch(() => ({})));
  const r = await bd().transaction((tx) => despachar(tx, params.id, actor, "web", puertas));
  return NextResponse.json({ ...(await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos))), puertasDespachadas: r.puertas });
}, { idempotente: true });
