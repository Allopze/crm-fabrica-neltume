import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_SESION, conPermiso, publico } from "@/domain/auth/politica";
import { cerrarSesion, HORAS_SESION, iniciarSesion } from "@/domain/auth/sesiones";

const Credenciales = z.strictObject({ email: z.string().min(3).max(254), clave: z.string().min(1).max(200) });
const segura = () => (process.env.APP_URL ?? "").startsWith("https://") || process.env.NODE_ENV === "production";

// POST /api/v1/sesion — login (REQ-ADM-1.1, 1.2)
export const POST = publico(async ({ req, ip, userAgent, correlacionId }) => {
  const { email, clave } = Credenciales.parse(await req.json());
  const r = await iniciarSesion(email, clave, { ip, userAgent, correlacionId });
  const res = NextResponse.json({ usuario: r.usuario, csrf: r.csrf });
  res.cookies.set(COOKIE_SESION, r.token, {
    httpOnly: true, sameSite: "lax", secure: segura(), path: "/", maxAge: HORAS_SESION * 3600,
  });
  return res;
});

// GET /api/v1/sesion — sesión actual, permisos y token CSRF
export const GET = conPermiso("sesion", async ({ sesion }) =>
  NextResponse.json({ usuario: sesion.usuario, permisos: [...sesion.permisos], csrf: sesion.csrf }),
);

// DELETE /api/v1/sesion — logout (revoca la sesión)
export const DELETE = conPermiso("sesion", async ({ sesion, ip, userAgent, correlacionId }) => {
  await cerrarSesion(sesion, { ip, userAgent, correlacionId });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(COOKIE_SESION);
  return res;
});
