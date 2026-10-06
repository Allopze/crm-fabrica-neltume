import { defineConfig } from "drizzle-kit";

// `npm run db:generar` crea el SQL de migración desde el esquema (no necesita BD).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/esquema/*.ts",
  out: "./src/db/migraciones",
  casing: "snake_case",
});
