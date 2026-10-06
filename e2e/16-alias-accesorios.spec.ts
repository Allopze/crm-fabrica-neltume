import { expect, test } from "@playwright/test";
import { ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 16 (TESTING §3): un alias creado en pantalla se aplica al cotizar y el marco «con su marco» se mapea por
// escuadría y largo (REQ-COT-2.11, 2.13), con el doble de la IA.
test.describe.configure({ mode: "serial" });

test("agrega el alias «fui» para el modelo Fuy", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/precios/alias");
  await expect(page.getByRole("cell", { name: "COSCOS", exact: true })).toBeVisible(); // semilla de la tienda
  const form = page.getByRole("form", { name: "Nuevo alias" });
  await form.getByLabel("Alias", { exact: true }).fill("fui");
  await form.getByLabel("Modelo").selectOption("FUY");
  await form.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("cell", { name: "FUI", exact: true })).toBeVisible();
});

test("«2 Fui oregón 70x200 con su marco 2x4 de 2,10» cotiza la puerta por alias y el marco por escuadría y largo", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/cotizaciones/nueva");
  await page.getByLabel("Texto del cliente").fill("Hola, necesito 2 Fui oregón 70x200 con su marco 2x4 de 2,10");
  await page.getByRole("button", { name: "Interpretar pedido" }).click();
  await expect(page.getByRole("heading", { name: "Ítems · 2" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("article", { name: "Ítem 1" })).toContainText("Fuy · Pino Oregón");
  await expect(page.getByRole("article", { name: "Ítem 2" })).toContainText("Marco · Pino Oregón · 2x4 pulg. kit 2,10 m");
  await expect(page.getByText("Por confirmar")).toHaveCount(0);
});
