import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { liberarPuerta } from "@/domain/puertas/acciones";

const Liberacion = z.strictObject({ motivo: z.string().trim().min(3).max(300) });

// POST /api/v1/puertas/:codigo/liberar — la puerta apartada vuelve a estar disponible (REQ-STK-8.5)
export const POST = conPermiso<{ codigo: string }>("stock.mover", async ({ req, params, actor }) => {
  const { motivo } = Liberacion.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  await bd().transaction((tx) => liberarPuerta(tx, decodeURIComponent(params.codigo), motivo, actor, "web", clave));
  return NextResponse.json({ ok: true }, { status: 201 });
}, { idempotente: true });
