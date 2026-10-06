import { expect, test } from "@playwright/test";
import { api, cotizacionId, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 07 (TESTING §3): no se aprueba con pendientes; se resuelve A y se fija el precio de un ítem a pedido.
test.describe.configure({ mode: "serial" });

test("con un ítem por confirmar no se puede aprobar, ni en la UI ni por la API", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await cotizacionId(page, "estado=borrador&q=Alerces");
  await ir(page, `/cotizaciones/${id}`);
  await expect(page.getByText("Resuelve 1 ítem para poder aprobar.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar cotización" })).toBeDisabled();
  const c = (await api(page, "GET", `/api/v1/cotizaciones/${id}`)).cuerpo;
  const r = await api(page, "POST", `/api/v1/cotizaciones/${id}/aprobar`, { version: c.version });
  expect(r.cuerpo.error.codigo).toBe("ITEMS_POR_CONFIRMAR");
});

test("quitar el ítem de roble deja A lista para aprobar", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, `/cotizaciones/${await cotizacionId(page, "estado=borrador&q=Alerces")}`);
  await page.getByRole("article", { name: "Ítem 2" }).getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByRole("heading", { name: "Ítems · 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar cotización" })).toBeEnabled();
});

test("un ítem a pedido muestra la referencia superior y una persona fija el precio, auditado", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/cotizaciones/nueva");
  await page.getByLabel("Texto del cliente").fill("2 Toltén raulí de 87x215");
  await page.getByRole("button", { name: "Interpretar pedido" }).click();
  const item = page.getByRole("article", { name: "Ítem 1" });
  await expect(item).toContainText("A pedido", { timeout: 20_000 });
  await expect(item).toContainText("Referencia:");
  await expect(item).toContainText("sin precio");
  await item.getByRole("button", { name: "Usar referencia" }).click();
  await item.getByRole("button", { name: "Fijar precio" }).click();
  await expect(item).toContainText("A pedido · precio fijado");
  await expect(item).not.toContainText("sin precio");
  const a = await api(page, "GET", `/api/v1/auditoria?accion=${encodeURIComponent("fijar precio a pedido")}`);
  expect(a.cuerpo.datos.length).toBe(1);
});
