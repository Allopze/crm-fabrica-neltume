import { NextResponse } from "next/server";
import { z } from "zod";
import { cambiarClavePropia } from "@/domain/auth/claves";
import { conPermiso } from "@/domain/auth/politica";

const Cambio = z.strictObject({ claveActual: z.string().min(1).max(200), claveNueva: z.string().min(1).max(200) });

// PUT /api/v1/sesion/clave — la persona cambia su contraseña con la actual; cierra sus otras sesiones (REQ-ADM-1.4)
export const PUT = conPermiso("sesion", async ({ req, sesion, ip, userAgent, correlacionId }) => {
  const { claveActual, claveNueva } = Cambio.parse(await req.json());
  await cambiarClavePropia(sesion, claveActual, claveNueva, { ip, userAgent, correlacionId });
  return new NextResponse(null, { status: 204 });
});
