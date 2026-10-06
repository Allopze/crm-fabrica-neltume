import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { quitarAlias } from "@/domain/cotizaciones/alias";

// DELETE /api/v1/alias-modelos/:alias (catalogo.editar, REQ-COT-2.11)
export const DELETE = conPermiso<{ alias: string }>("catalogo.editar", async ({ params, actor }) => {
  await bd().transaction((tx) => quitarAlias(tx, decodeURIComponent(params.alias), actor, "web"));
  return new Response(null, { status: 204 });
});
