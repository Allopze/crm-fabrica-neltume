import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { revertirPago } from "@/domain/pedidos/pagos";

// POST /api/v1/pedidos/:id/pagos/:pagoId/reverso — anula un pago con un registro opuesto y motivo (REQ-COT-8.10)
export const POST = conPermiso<{ id: string; pagoId: string }>("pagos.registrar", async ({ req, params, actor }) => {
  const { motivo } = z.strictObject({ motivo: z.string().trim().min(1).max(300) }).parse(await req.json());
  return NextResponse.json(await bd().transaction((tx) => revertirPago(tx, params.id, params.pagoId, motivo, actor, "web")));
}, { idempotente: true });
