import { expect, test } from "@playwright/test";
import { api, cotizacionId, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 10 (TESTING §3): nuevas versiones de la lista (re-importación v2 y edición en pantalla v3)
// no tocan la cotización A; un borrador anterior ofrece "Recalcular".
test.describe.configure({ mode: "serial" });

test("con la lista v2 importada y un precio editado (v3), A conserva sus precios", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const a = await cotizacionId(page, "estado=aceptada&q=Alerces");
  const antes = (await api(page, "GET", `/api/v1/cotizaciones/${a}`)).cuerpo;
  // Borrador creado con la lista v1, antes del cambio.
  const b = await api(page, "POST", "/api/v1/cotizaciones", { items: [{ codigo: "NEL-O-3-B", cantidad: 1 }] });
  expect(b.estado).toBe(201);

  await ir(page, "/precios/importar");
  await page.getByLabel("Archivo Excel").setInputFiles("e2e/fixtures/cotizador-mini-v2.xlsx");
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByRole("region", { name: "Informe de importación" })).toContainText("Lista de precios vigente: v2");

  await ir(page, "/precios?q=NEL-O-3-B");
  await page.getByRole("button", { name: "Editar precio de NEL-O-3-B" }).click();
  await page.getByLabel("Nuevo precio neto de NEL-O-3-B").fill("250000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("main")).toContainText("v3");

  const despues = (await api(page, "GET", `/api/v1/cotizaciones/${a}`)).cuerpo;
  expect(despues.total).toBe(antes.total);
  expect(despues.items.map((i: { precioUnitario: number }) => i.precioUnitario)).toEqual(antes.items.map((i: { precioUnitario: number }) => i.precioUnitario));
  expect(despues.lista.usada).toBe(1);
});

test("el borrador hecho con la v1 avisa y se recalcula con la v3", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, `/cotizaciones/${await cotizacionId(page, "estado=borrador")}`);
  const aviso = page.getByRole("status").filter({ hasText: "la vigente es la v3" });
  await expect(aviso).toContainText("usa la lista v1");
  await aviso.getByRole("button", { name: "Recalcular con la lista vigente" }).click();
  await expect(aviso).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("lista v3");
});
