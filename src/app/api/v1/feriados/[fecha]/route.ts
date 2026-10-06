import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { quitarFeriado } from "@/domain/precios/calendario";

// DELETE /api/v1/feriados/:fecha — quita un feriado adicional; los legales no se pueden quitar (REQ-COT-6.6)
export const DELETE = conPermiso<{ fecha: string }>("config.editar", async ({ params, actor }) => {
  await bd().transaction((tx) => quitarFeriado(tx, params.fecha, actor, "web"));
  return new Response(null, { status: 204 });
});
