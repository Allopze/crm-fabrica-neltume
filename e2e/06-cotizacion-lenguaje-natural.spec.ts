import { expect, test } from "@playwright/test";
import { elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN, CLIENTE_A, TEXTO_A } from "./datos";

// Suite 06 (TESTING §3): del texto del cliente a un borrador con avisos de stock e ítems por confirmar.
// Parte del stock de 04 (2 NEL-R-4-B). Deja el borrador A para Constructora Los Alerces.
test.describe.configure({ mode: "serial" });

test("registra el cliente de la cotización A", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  const form = page.getByRole("form", { name: "Nuevo cliente" });
  await form.getByLabel("Nombre o razón social").fill(CLIENTE_A.nombre);
  await form.getByLabel("RUT").fill(CLIENTE_A.rut);
  await form.getByLabel("Dirección de despacho").fill(CLIENTE_A.despacho);
  await form.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("main")).toContainText(CLIENTE_A.nombre);
});

test("pega el pedido y obtiene un borrador con aviso de stock y un ítem por confirmar", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/cotizaciones/nueva");
  await page.getByLabel("Texto del cliente").fill(TEXTO_A);
  await elegirDropdown(page.getByLabel("Cliente", { exact: true }), { label: CLIENTE_A.nombre });
  await page.getByRole("button", { name: "Interpretar pedido" }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);

  // La revisión espera al worker (doble determinista) y luego muestra los ítems.
  await expect(page.getByRole("heading", { name: "Ítems · 2" })).toBeVisible({ timeout: 20_000 });
  const neltume = page.getByRole("article", { name: "Ítem 1" });
  await expect(neltume).toContainText("Neltume · Raulí");
  await expect(neltume.getByLabel("Cantidad")).toHaveValue("3");
  await expect(neltume).toContainText("Disponible 2 · faltan 1");
  const roble = page.getByRole("article", { name: "Ítem 2" });
  await expect(roble).toContainText("Por confirmar");
  await expect(roble).toContainText("El roble no está en el catálogo");
  // El texto original se muestra tal como llegó, con el fragmento marcado.
  await expect(page.locator("mark").filter({ hasText: "3 puertas Neltume en raulí de 90x210" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar cotización" })).toBeDisabled();
});

test("el borrador A aparece en el listado y en el panel", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await expect(page.getByRole("main")).toContainText("1 cotización");
  await expect(page.getByRole("link", { name: new RegExp(CLIENTE_A.nombre) })).toContainText("1 por confirmar");
  await ir(page, "/cotizaciones?estado=borrador");
  await expect(page.getByRole("row").filter({ hasText: CLIENTE_A.nombre })).toContainText("1 por confirmar");
});
