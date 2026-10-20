import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { editarMapeo } from "@/domain/compras/proveedores";

const Mapeo = z.strictObject({ materiaPrimaId: z.uuid().optional(), factor: z.number().positive().max(1e6).optional(), ignorar: z.boolean().optional() });

// PATCH /api/v1/mapeos-compra/:id — cambia el destino del ítem para las facturas que vengan (REQ-MP-7.2, 7.9)
export const PATCH = conPermiso<{ id: string }>("mp.editar", async ({ req, params, actor }) => {
  const d = Mapeo.parse(await req.json());
  await bd().transaction((tx) => editarMapeo(tx, params.id, d, actor, "web"));
  return NextResponse.json({ ok: true });
});
