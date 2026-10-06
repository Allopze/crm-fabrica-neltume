import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { pasarAProduccion } from "@/domain/pedidos/ciclo";
import { obtenerPedido } from "@/domain/pedidos/consulta";

// POST /api/v1/pedidos/:id/produccion — pasa a producción y crea la orden por el faltante (REQ-COT-8.5)
export const POST = conPermiso<{ id: string }>(["pedidos.gestionar", "produccion.gestionar"], async ({ params, actor, sesion }) => {
  const { orden } = await bd().transaction((tx) => pasarAProduccion(tx, params.id, actor, "web"));
  return NextResponse.json({ orden, pedido: await obtenerPedido(bd(), params.id, sesion.permisos.has("clientes.ver")) });
}, { idempotente: true });
