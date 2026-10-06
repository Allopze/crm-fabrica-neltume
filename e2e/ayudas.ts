import { expect, type Page } from "@playwright/test";

export async function ingresar(page: Page, email: string, clave: string, exito = true) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  if (exito) await expect(page).toHaveURL(/\/$/);
}

export async function csrf(page: Page): Promise<string> {
  const r = await page.request.get("/api/v1/sesion");
  return (await r.json()).csrf;
}
