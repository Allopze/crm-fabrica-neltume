import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { cargarEnvLocal, conBase, requerirEnv } from "../src/db/urls";
import { ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 01 (TESTING §3): BD vacía + crear-admin + importación del Excel mini desde la UI.
test.describe.configure({ mode: "serial" });
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

test("importa el Excel desde la UI e informa la fila corregida", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/precios/importar");
  await page.getByLabel("Archivo Excel").setInputFiles("e2e/fixtures/cotizador-mini.xlsx");
  await page.getByRole("button", { name: "Importar" }).click();
  const informe = page.getByRole("region", { name: "Informe de importación" });
  await expect(informe).toContainText("Lista de precios vigente: v1");
  await expect(informe.getByText("Creadas").locator("..")).toContainText("70");
  await expect(informe).toContainText("Filas corregidas · 1");
  await expect(informe).toContainText("Código NEL-O-3-B → NEL-O-3-C");
});

test("re-importar el mismo archivo no duplica nada", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/precios/importar");
  await page.getByLabel("Archivo Excel").setInputFiles("e2e/fixtures/cotizador-mini.xlsx");
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByRole("region", { name: "Informe de importación" })).toContainText("ya se había importado");
});
