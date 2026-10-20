import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { MEDIOS_PAGO } from "@/db/esquema/comercial";
import { conPermiso } from "@/domain/auth/politica";
import { registrarPago } from "@/domain/pedidos/pagos";

// El monto del pago es el único importe que acepta esta API además del precio a pedido: solo suma al pagado (SECURITY T2).
const Pago = z.strictObject({
  monto: z.number().int().positive().max(100_000_000_000),
  fecha: z.iso.date(),
  medio: z.enum(MEDIOS_PAGO),
  referencia: z.string().trim().max(60).nullable().optional(),
});

// POST /api/v1/pedidos/:id/pagos — pago de solo inserción que no supera el saldo (REQ-COT-8.10, 8.11; ADR-0020)
export const POST = conPermiso<{ id: string }>("pagos.registrar", async ({ req, params, actor }) => {
  const d = Pago.parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => registrarPago(tx, params.id, d, actor, "web")), { status: 201 });
}, { idempotente: true });
