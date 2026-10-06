import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { aplicarDescuento } from "@/domain/cotizaciones/edicion";

const Descuento = z.strictObject({
  porcentaje: z.number().min(0).max(99.99),
  motivo: z.string().trim().min(3, "El descuento necesita un motivo.").max(300),
  version: z.number().int().positive(),
});

// POST /api/v1/cotizaciones/:id/descuento — excepción manual con motivo, auditada (REQ-COT-7.1, 7.2)
export const POST = conPermiso<{ id: string }>("descuentos.aplicar", async ({ req, params, actor, sesion }) => {
  const { version, ...d } = Descuento.parse(await req.json());
  await bd().transaction((tx) => aplicarDescuento(tx, params.id, d, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
