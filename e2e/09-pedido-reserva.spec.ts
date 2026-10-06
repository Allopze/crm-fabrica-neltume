import { expect, test } from "@playwright/test";
import { api, cotizacionId, ingresar, ir } from "./ayudas";
import { ADMIN, CLIENTE_A } from "./datos";

// Suite 09 (TESTING §3): A pasa a nota de pedido, reserva 2 NEL-R-4-B y marca 1 por fabricar;
// otro pedido (cotizado a mano) se cancela y libera su reserva.
test.describe.configure({ mode: "serial" });

test("convertir A en pedido reserva lo disponible y marca el faltante", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, `/cotizaciones/${await cotizacionId(page, "estado=aprobada&q=Alerces")}`);
  await page.getByRole("link", { name: "Convertir en pedido" }).click();
  await expect(page.getByRole("heading", { name: "Convertir en nota de pedido" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("reserva 2");
  await expect(page.getByRole("main")).toContainText("por fabricar 1");
  await expect(page.getByLabel("Dirección de despacho")).toHaveValue(CLIENTE_A.despacho);
  await page.getByLabel("Medio de transporte").fill("Camión propio");
  await page.getByRole("button", { name: "Confirmar pedido y reservar" }).click();

  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main")).toContainText("2 de 3 reservadas");
  await expect(page.getByRole("main")).toContainText("Faltan 1 por fabricar");
  await expect(page.getByRole("main")).toContainText("Camión propio");
  const stock = (await api(page, "GET", "/api/v1/stock/NEL-R-4-B")).cuerpo;
  expect(stock).toMatchObject({ existencia: 2, reservado: 2, disponible: 0 });
});

test("A no se convierte dos veces", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await cotizacionId(page, "estado=aceptada&q=Alerces");
  const r = await api(page, "POST", "/api/v1/pedidos", { cotizacionId: id });
  expect(r.cuerpo.error.codigo).toBe("YA_TIENE_PEDIDO");
  await ir(page, `/cotizaciones/${id}`);
  await expect(page.getByRole("link", { name: "Convertir en pedido" })).toHaveCount(0);
});

test("una cotización manual pasa a pedido, se cancela con motivo y libera la reserva", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/cotizaciones/manual");
  await page.getByLabel("Buscar artículo por código o modelo").fill("ANC-O-3-A");
  await page.getByRole("option", { name: /ANC-O-3-A/ }).click();
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: CLIENTE_A.nombre });
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Aprobar cotización" }).click();
  await page.getByRole("link", { name: "Convertir en pedido" }).click();
  await page.getByRole("button", { name: "Confirmar pedido y reservar" }).click();
  await expect(page.getByRole("main")).toContainText("1 de 1 reservadas");
  const antes = (await api(page, "GET", "/api/v1/stock/ANC-O-3-A")).cuerpo;
  expect(antes.reservado).toBe(1);

  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await page.getByLabel("Motivo de la cancelación").fill("El cliente cambió el pedido");
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByRole("status")).toContainText("Las reservas se liberaron");
  const despues = (await api(page, "GET", "/api/v1/stock/ANC-O-3-A")).cuerpo;
  expect(despues).toMatchObject({ reservado: 0, disponible: antes.existencia });
});
