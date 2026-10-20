import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { bd } from "@/db/conexion";
import { cotizacion } from "@/db/esquema/comercial";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";

// GET /api/v1/cotizaciones/:id/estado — sondeo ligero mientras la IA interpreta (UX §3).
export const GET = conPermiso<{ id: string }>("cotizaciones.crear", async ({ params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  const [c] = await bd().select({ estado: cotizacion.estado, version: cotizacion.version }).from(cotizacion).where(eq(cotizacion.id, params.id));
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  return NextResponse.json(c);
}, { ocultar: "Cotización no encontrada" });
