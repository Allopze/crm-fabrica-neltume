import { expect, test } from "@playwright/test";
import { api, ingresar, ir } from "./ayudas";
import { ADMIN, CLIENTE_A } from "./datos";

// Suite 13 (TESTING §3): si la IA no responde o falla, el texto queda guardado y se cotiza a mano.
test.describe.configure({ mode: "serial" });

for (const [caso, texto] of [["timeout", "Simular IA caída: 2 puertas Neltume raulí 90x210"], ["error 500", "Simular error 500 para 1 Fuy"]] as const) {
  test(`con ${caso} queda ia_fallida y el texto se conserva`, async ({ page }) => {
    await ingresar(page, ADMIN.email, ADMIN.clave);
    await ir(page, "/cotizaciones/nueva");
    await page.getByLabel("Texto del cliente").fill(texto);
    await page.getByRole("button", { name: "Interpretar pedido" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No pudimos interpretar el pedido" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("main")).toContainText(texto);
    await expect(page.getByLabel("Agregar ítem del catálogo")).toBeVisible();
  });
}

test("la cotización con IA caída se completa a mano y se aprueba (cotización C)", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const r = await api(page, "GET", "/api/v1/cotizaciones?estado=ia_fallida");
  const id = r.cuerpo.datos.at(-1).id; // la del timeout, la primera de las dos
  await ir(page, `/cotizaciones/${id}`);
  await page.getByRole("button", { name: "Cotizar a mano" }).click();
  await expect(page.getByLabel("Agregar ítem del catálogo")).toBeFocused();
  await page.keyboard.type("NEL-O-3-B");
  await page.getByRole("option", { name: /NEL-O-3-B/ }).click();
  await expect(page.getByRole("heading", { name: "Ítems · 1" })).toBeVisible();
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: CLIENTE_A.nombre });
  await expect(page.getByRole("button", { name: "Aprobar cotización" })).toBeEnabled();
  await page.getByRole("button", { name: "Aprobar cotización" }).click();
  await page.getByRole("button", { name: "Confirmar aprobación" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aprobada por" })).toBeVisible();
  const c = (await api(page, "GET", `/api/v1/cotizaciones/${id}`)).cuerpo;
  expect(c).toMatchObject({ estado: "aprobada", origen: "ia" });
  expect(c.textoOriginal).toContain("Simular IA caída");
});
