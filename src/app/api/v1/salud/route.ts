import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { publico } from "@/domain/auth/politica";

// GET /api/v1/salud — para healthchecks de Compose. Sin sesión y sin detalles internos (DESIGN §5).
export const GET = publico(async () => {
  try {
    await bd().execute(sql`select 1`);
    return NextResponse.json({ estado: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ estado: "degradado" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
});
