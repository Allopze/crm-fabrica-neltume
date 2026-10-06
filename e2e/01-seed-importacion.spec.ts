import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { cargarEnvLocal, conBase, requerirEnv } from "../src/db/urls";
import { ADMIN } from "./datos";

// Suite 01 (TESTING §3): BD vacía + crear-admin. La importación del Excel se agrega en la Fase 1 (T1.6).
test("crear-admin crea el primer administrador desde la consola", () => {
  cargarEnvLocal();
  const salida = execFileSync("npx", ["tsx", "scripts/crear-admin.mts"], {
    input: `${ADMIN.email}\n${ADMIN.nombre}\n${ADMIN.clave}\n`,
    env: { ...process.env, DATABASE_URL: conBase(requerirEnv("DATABASE_URL"), "neltume_e2e") },
    encoding: "utf8",
  });
  expect(salida).toContain(`Administrador ${ADMIN.email} creado`);
  expect(salida).not.toContain(ADMIN.clave);
});

test("sin sesión, cualquier pantalla interna lleva al login", async ({ page }) => {
  await page.goto("/stock");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
});
