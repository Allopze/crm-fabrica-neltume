import type { NextConfig } from "next";

export const ENCABEZADOS_SEGURIDAD = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Los E2E levantan su propio `next dev` en otra carpeta para no chocar con el de desarrollo.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  poweredByHeader: false,
  // Encabezados de seguridad en toda respuesta (SECURITY §2, ADR-0011; antes los ponía Caddy). TLS lo termina Cloudflare.
  async headers() {
    return [{ source: "/:path*", headers: ENCABEZADOS_SEGURIDAD }];
  },
  // Lector de la nota de la tienda (ADR-0008): pdfjs se carga desde node_modules, sin empaquetarlo.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
