import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los E2E levantan su propio `next dev` en otra carpeta para no chocar con el de desarrollo.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
};

export default nextConfig;
