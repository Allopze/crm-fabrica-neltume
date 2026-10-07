import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarSalida } from "@/domain/puertas/mover";
import { Salida } from "../esquemas";

// POST /api/v1/movimientos/salidas — salida por despacho con las puertas indicadas o las más antiguas; nunca deja
// disponible ni existencia negativos (REQ-STK-4.1–4.3, 8.3). La salida de una nota de pedido se registra desde el pedido.
export const POST = conPermiso("stock.mover", async ({ req, actor }) => {
  const d = Salida.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  return NextResponse.json(await bd().transaction((tx) => registrarSalida(tx, d, actor, "web", clave)), { status: 201 });
}, { idempotente: true });
