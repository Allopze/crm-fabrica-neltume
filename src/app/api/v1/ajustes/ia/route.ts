import { NextResponse } from "next/server";
import { z } from "zod";
import { estadoAjustesIA, guardarAjustesIA, PROVEEDORES } from "@/ai/ajustes";
import { conPermiso } from "@/domain/auth/politica";

export const dynamic = "force-dynamic";
const Entrada = z.strictObject({
  proveedorActivo: z.enum(PROVEEDORES).optional(),
  modelo: z.string().trim().min(1).max(200).optional(),
});

// GET /api/v1/ajustes/ia: las claves del worker nunca forman parte de la respuesta.
export const GET = conPermiso("config.editar", async () => {
  const estado = await estadoAjustesIA();
  return NextResponse.json(estado, { headers: { "cache-control": "no-store, private" } });
});

// PUT /api/v1/ajustes/ia: solo cambia proveedor/modelo (ADR-0022: Command Code, que siempre pide retención cero).
export const PUT = conPermiso("config.editar", async ({ req, actor, correlacionId }) => {
  const entrada = Entrada.parse(await req.json());
  const resultado = await guardarAjustesIA(entrada, actor, correlacionId);
  return NextResponse.json(resultado, { headers: { "cache-control": "no-store, private" } });
});
