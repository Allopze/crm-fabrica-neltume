import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";
import { registrarExcepcion } from "@/domain/pedidos/pagos";

const Excepcion = z.strictObject({ tipo: z.enum(["abono", "saldo"]), motivo: z.string().trim().min(1).max(300) });

// POST /api/v1/pedidos/:id/excepcion-pago — producir sin abono o despachar con saldo en esta nota, con motivo (REQ-COT-8.13)
export const POST = conPermiso<{ id: string }>(["pagos.registrar", "pedidos.gestionar"], async ({ req, params, actor, sesion }) => {
  const { tipo, motivo } = Excepcion.parse(await req.json());
  await bd().transaction((tx) => registrarExcepcion(tx, params.id, tipo, motivo, actor, "web"));
  return NextResponse.json(await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos)));
}, { idempotente: true });
