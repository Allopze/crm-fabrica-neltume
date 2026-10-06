import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarBoms } from "@/domain/bom";

// GET /api/v1/bom — última versión de cada BOM (REQ-MP-3)
export const GET = conPermiso("stock.ver", async ({ req }) => {
  const modelo = req.nextUrl.searchParams.get("modelo")?.toUpperCase();
  const datos = (await listarBoms(bd())).filter((b) => !modelo || b.modeloCodigo === modelo);
  return NextResponse.json({ datos });
});
