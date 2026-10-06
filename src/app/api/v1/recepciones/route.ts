import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarRecepcion } from "@/domain/materias-primas";

const Recepcion = z.strictObject({
  materiaPrimaId: z.uuid(),
  cantidad: z.number().positive().max(1e7),
  referencia: z.string().trim().max(120).optional(),
});

// POST /api/v1/recepciones — idempotente: un doble envío registra una sola entrada (REQ-MP-2.1–2.4)
export const POST = conPermiso("mp.mover", async ({ req, actor }) => {
  const d = Recepcion.parse(await req.json());
  const clave = req.headers.get("idempotency-key") ?? undefined;
  const m = await bd().transaction((tx) => registrarRecepcion(tx, d, actor, "web", clave));
  return NextResponse.json({ id: m.id }, { status: 201 });
}, { idempotente: true });
