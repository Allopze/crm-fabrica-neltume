import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { resolverRecepcion } from "@/domain/integracion-tienda/resolver";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";

const Resolucion = z.strictObject({ accion: z.enum(["aplicar", "descartar"]), motivo: z.string().trim().min(1, "Indica el motivo.").max(500) });

// POST /api/v1/pedidos/:id/recepciones/:recepcionId — aplicar o descartar una revisión o anulación de la tienda que
// llegó con la nota en curso (ADR-0023 §4, D2, D5). Aplicar una revisión cancela esta nota y crea la nueva.
export const POST = conPermiso<{ id: string; recepcionId: string }>("pedidos.gestionar", async ({ req, params, actor, sesion }) => {
  const d = Resolucion.parse(await req.json());
  const r = await bd().transaction((tx) => resolverRecepcion(tx, params.id, params.recepcionId, d, actor, "web"));
  return NextResponse.json({ nueva: r.nueva, pedido: await obtenerPedido(bd(), params.id, vistaDe(sesion.permisos)) });
}, { idempotente: true });
