import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { ordenProduccion } from "@/db/esquema/produccion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { planDeCierre } from "@/domain/ordenes";

// GET /api/v1/ordenes/:id — orden con vista previa del cierre (consumos y faltantes)
export const GET = conPermiso<{ id: string }>("produccion.gestionar", async ({ params }) => {
  const id = z.uuid().safeParse(params.id);
  const [o] = id.success ? await bd().select().from(ordenProduccion).where(eq(ordenProduccion.id, id.data)) : [];
  if (!o) throw new ErrorDominio("NO_ENCONTRADO", "Orden no encontrada");
  return NextResponse.json({ ...o, plan: await planDeCierre(bd(), o.id) });
});
