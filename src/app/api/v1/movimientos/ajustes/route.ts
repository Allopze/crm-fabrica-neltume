import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { articuloPorCodigo, registrarMovimientos } from "@/domain/stock";
import { Ajuste } from "../esquemas";

// POST /api/v1/movimientos/ajustes — corrección con motivo obligatorio; nunca se edita el saldo (REQ-STK-5.1–5.4, REQ-MP-5)
export const POST = conPermiso("stock.ajustar", async ({ req, actor }) => {
  const a = Ajuste.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  const [m] = await bd().transaction(async (tx) => {
    const item = a.codigo ? { articuloId: (await articuloPorCodigo(tx, a.codigo)).id } : { materiaPrimaId: a.materiaPrimaId };
    if (item.articuloId && !Number.isInteger(a.cantidad)) throw new ErrorDominio("VALIDACION", "Las puertas se ajustan en unidades enteras.");
    return registrarMovimientos(tx, [{ ...item, tipo: "ajuste", cantidad: a.cantidad, motivo: a.motivo, refTipo: "ajuste" }], actor, "web", clave);
  });
  return NextResponse.json({ id: m.id }, { status: 201 });
}, { idempotente: true });
