import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarPedidos, vistaDe } from "@/domain/pedidos/consulta";
import { crearPedido } from "@/domain/pedidos/pedidos";

const Filtro = z.object({
  estado: z.enum(["pendiente", "en_produccion", "lista", "despachada", "cancelada"]).optional(),
  estadoPago: z.enum(["sin_control", "sin_abono", "abonado", "pagado"]).optional(),
  antesDe: z.coerce.number().int().positive().optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});
const Nuevo = z.strictObject({
  cotizacionId: z.uuid(),
  direccionDespacho: z.string().trim().max(300).nullable().optional(),
  medioTransporte: z.string().trim().max(120).nullable().optional(),
});

// GET /api/v1/pedidos — reservado, total, pagado y estado de pago por nota; filtra por estado y estado de pago (REQ-COT-8.1, 8.12)
export const GET = conPermiso("pedidos.gestionar", async ({ req, sesion }) =>
  NextResponse.json(await listarPedidos(bd(), Filtro.parse(Object.fromEntries(req.nextUrl.searchParams)), vistaDe(sesion.permisos))));

// POST /api/v1/pedidos — crea la nota y reserva lo disponible (REQ-COT-8.1–8.4, REQ-STK-7.1, 7.3)
export const POST = conPermiso("pedidos.gestionar", async ({ req, actor }) => {
  const d = Nuevo.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => crearPedido(tx, d, actor, "web")), { status: 201 });
}, { idempotente: true });
