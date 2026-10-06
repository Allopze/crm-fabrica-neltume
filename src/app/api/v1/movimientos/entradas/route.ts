import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { articuloPorCodigo, registrarMovimientos } from "@/domain/stock";
import { MovimientoPuerta } from "../esquemas";

// POST /api/v1/movimientos/entradas — entrada de puertas terminadas (REQ-STK-3.1–3.4)
export const POST = conPermiso("stock.mover", async ({ req, actor }) => {
  const { codigo, cantidad, referencia } = MovimientoPuerta.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  const [m] = await bd().transaction(async (tx) => {
    const a = await articuloPorCodigo(tx, codigo);
    return registrarMovimientos(tx, [{ articuloId: a.id, tipo: "entrada_produccion", cantidad, refTipo: "manual", refId: referencia }], actor, "web", clave);
  });
  return NextResponse.json({ id: m.id }, { status: 201 });
}, { idempotente: true });
