import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearPedidoDirecto } from "@/domain/pedidos/directo";
import { campo, pdfDelFormulario } from "./archivo";

const opcional = (max: number) => z.string().trim().max(max).optional();

// POST /api/v1/pedidos/nota-tienda — crea el pedido desde el PDF; el servidor vuelve a leerlo (ADR-0008, REQ-COT-8.6–8.9)
export const POST = conPermiso("pedidos.gestionar", async ({ req, actor }) => {
  const { datos, form } = await pdfDelFormulario(req);
  const d = z.strictObject({
    clienteId: z.uuid({ message: "Elige la tienda" }), direccionDespacho: opcional(300), medioTransporte: opcional(120),
    entregaComprometida: z.iso.date().or(z.literal("")).optional(), observaciones: opcional(1000),
  }).parse({
    clienteId: campo(form, "clienteId"), direccionDespacho: campo(form, "direccionDespacho"), medioTransporte: campo(form, "medioTransporte"),
    entregaComprometida: campo(form, "entregaComprometida"), observaciones: campo(form, "observaciones"),
  });
  const r = await bd().transaction((tx) => crearPedidoDirecto(tx, datos, d, actor, "web"));
  return NextResponse.json(r, { status: 201 });
}, { idempotente: true });
