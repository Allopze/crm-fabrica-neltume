import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { importacion } from "@/db/esquema/catalogo";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";

// GET /api/v1/importaciones/:id — informe de una importación (sin costos ni precios)
export const GET = conPermiso<{ id: string }>("catalogo.editar", async ({ params }) => {
  const id = z.uuid().safeParse(params.id);
  const [imp] = id.success ? await bd().select().from(importacion).where(eq(importacion.id, id.data)) : [];
  if (!imp) throw new ErrorDominio("NO_ENCONTRADO", "Importación no encontrada");
  return NextResponse.json(imp);
});
