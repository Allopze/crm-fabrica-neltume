// Content-Security-Policy con nonce por petición (auditoría M-01; guía de Next 16 en
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Next aplica el nonce a sus scripts.
// Los demás encabezados de seguridad siguen en next.config.ts.
import { NextResponse, type NextRequest } from "next/server";
import { politicaCsp } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaCsp(nonce, process.env.NODE_ENV === "development");
  const cabeceras = new Headers(request.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("Content-Security-Policy", csp);
  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set("Content-Security-Policy", csp);
  return respuesta;
}

export const config = {
  matcher: [
    {
      // Páginas: no la API (JSON y PDF), los estáticos ni los íconos del navegador.
      source: "/((?!api|_next/static|_next/image|icon.svg|apple-icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
