import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarAjuste } from "@/domain/puertas/mover";
import { Ajuste } from "../esquemas";

// POST /api/v1/movimientos/ajustes — corrección con motivo obligatorio; nunca se edita el saldo (REQ-STK-5.1–5.4, 8.3, REQ-MP-5)
export const POST = conPermiso("stock.ajustar", async ({ req, actor }) => {
  const d = Ajuste.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  return NextResponse.json(await bd().transaction((tx) => registrarAjuste(tx, d, actor, "web", clave)), { status: 201 });
}, { idempotente: true });
