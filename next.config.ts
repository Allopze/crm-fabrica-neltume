import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los E2E levantan su propio `next dev` en otra carpeta para no chocar con el de desarrollo.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  poweredByHeader: false,
  // Lector de la nota de la tienda (ADR-0008): pdfjs se carga desde node_modules, sin empaquetarlo.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
