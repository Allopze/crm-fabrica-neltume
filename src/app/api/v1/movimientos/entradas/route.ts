import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarEntrada } from "@/domain/puertas/mover";
import { Entrada } from "../esquemas";

// POST /api/v1/movimientos/entradas — entrada de puertas terminadas, cada una con su código (REQ-STK-3.1–3.4, 8.2)
export const POST = conPermiso("stock.mover", async ({ req, actor }) => {
  const d = Entrada.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  return NextResponse.json(await bd().transaction((tx) => registrarEntrada(tx, d, actor, "web", clave)), { status: 201 });
}, { idempotente: true });
