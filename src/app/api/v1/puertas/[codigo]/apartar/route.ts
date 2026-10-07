import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { apartarPuerta } from "@/domain/puertas/acciones";

const Apartado = z.strictObject({ para: z.string().trim().min(2).max(120) });

// POST /api/v1/puertas/:codigo/apartar — reserva la puerta para un cliente sin nota de pedido (REQ-STK-8.5)
export const POST = conPermiso<{ codigo: string }>("stock.mover", async ({ req, params, actor }) => {
  const { para } = Apartado.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  await bd().transaction((tx) => apartarPuerta(tx, decodeURIComponent(params.codigo), para, actor, "web", clave));
  return NextResponse.json({ ok: true }, { status: 201 });
}, { idempotente: true });
