import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { prepararNotaTienda } from "@/domain/pedidos/directo";
import { campo, pdfDelFormulario } from "../archivo";

// POST /api/v1/pedidos/nota-tienda/vista-previa — lee la nota de la tienda y la valida, sin escribir (ADR-0008, REQ-COT-8.6)
export const POST = conPermiso("pedidos.gestionar", async ({ req }) => {
  const { datos, form } = await pdfDelFormulario(req);
  const clienteId = z.uuid().optional().parse(campo(form, "clienteId") || undefined);
  const v = await bd().transaction((tx) => prepararNotaTienda(tx, datos, clienteId));
  return NextResponse.json({ ...v, hash: undefined });
});
