import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { proveedorCompra } from "@/db/esquema/compras";
import { conPermiso } from "@/domain/auth/politica";
import { desactivarProveedor, habilitarProveedor } from "@/domain/compras/proveedores";
import { ErrorDominio } from "@/domain/errores";
import { normalizarRut } from "@/domain/rut";

// PATCH /api/v1/proveedores-compra/:rut — desactiva o reactiva (desde hoy) un proveedor (REQ-MP-7.1, 7.9)
export const PATCH = conPermiso<{ rut: string }>("mp.editar", async ({ req, params, actor }) => {
  const { activo } = z.strictObject({ activo: z.boolean() }).parse(await req.json());
  await bd().transaction(async (tx) => {
    if (!activo) return desactivarProveedor(tx, params.rut, actor, "web");
    const [p] = await tx.select().from(proveedorCompra).where(eq(proveedorCompra.rut, normalizarRut(params.rut) ?? ""));
    if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Proveedor no encontrado");
    if (!p.activo) await habilitarProveedor(tx, { rut: p.rut, nombre: p.nombre }, actor, "web");
  });
  return NextResponse.json({ ok: true });
});
