import { expect, test } from "@playwright/test";
import { csrf, elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 05 (TESTING §3): entrada, salida sin stock, ajuste con motivo, movimientos inmutables.
// Usa ANC-O-3-A para no interferir con NEL-R-4-B, que alimenta la suite del cotizador.
test.describe.configure({ mode: "serial" });

test("registra una entrada por producción y el stock la refleja", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/stock");
  await page.getByRole("button", { name: "Entrada" }).click();
  const form = page.getByRole("form", { name: "Entrada por producción" });
  await form.getByLabel("Código").fill("ANC-O-3-A");
  await form.getByLabel("Cantidad").fill("5");
  await form.getByLabel("Referencia").fill("Orden E2E");
  await form.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toContainText("registrada");
  await expect(page.getByRole("row").filter({ hasText: "ANC-O-3-A" })).toContainText("5");
});

test("una salida mayor al disponible se rechaza con el faltante", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/stock/ANC-O-3-A");
  await page.getByRole("button", { name: "Salida" }).click();
  const form = page.getByRole("form", { name: "Salida por despacho" });
  await form.getByLabel("Cantidad").fill("9");
  await form.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No hay stock suficiente");
});

test("un ajuste exige motivo y queda en el historial", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const token = await csrf(page);
  const sinMotivo = await page.request.post("/api/v1/movimientos/ajustes", {
    headers: { "x-csrf-token": token, "idempotency-key": crypto.randomUUID() }, data: { codigo: "ANC-O-3-A", cantidad: -1 },
  });
  expect(sinMotivo.status()).toBe(400);

  await ir(page, "/stock/ANC-O-3-A");
  await page.getByRole("button", { name: "Ajuste" }).click();
  const form = page.getByRole("form", { name: "Ajuste con motivo" });
  await form.getByLabel("Cantidad").fill("-1");
  await form.getByLabel("Motivo").fill("Puerta con grieta en el panel");
  await form.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Motivo: Puerta con grieta en el panel")).toBeVisible();
  await expect(page.getByText("Existencia").locator("..")).toContainText("4");
});

test("los movimientos no se pueden editar ni borrar", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/stock/ANC-O-3-A");
  await expect(page.getByText("inmutables")).toBeVisible();
  await expect(page.getByRole("button", { name: /editar movimiento|borrar/i })).toHaveCount(0);
  const token = await csrf(page);
  for (const metodo of ["put", "patch", "delete"] as const) {
    const r = await page.request[metodo]("/api/v1/movimientos/cualquiera", { headers: { "x-csrf-token": token } });
    expect([404, 405]).toContain(r.status());
  }
});

test("un ajuste de materia prima exige motivo y queda registrado (REQ-MP-5)", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/materias-primas");
  const form = page.getByRole("form", { name: "Ajuste de materia prima" });
  await elegirDropdown(form.getByLabel("Materia prima"), { label: "Tabla raulí 1\"" });
  await form.getByLabel("Cantidad (+ suma, − resta)").fill("-1,5");
  await form.getByRole("button", { name: "Registrar ajuste" }).click();
  expect(await form.getByLabel("Motivo").evaluate((e) => (e as HTMLInputElement).validity.valueMissing)).toBe(true);
  await form.getByLabel("Motivo").fill("Conteo físico de fin de mes");
  await form.getByRole("button", { name: "Registrar ajuste" }).click();
  await expect(form.getByRole("status")).toContainText("Ajuste registrado.");
});

test("cada puerta tiene su código: se mueve de ubicación, se aparta y se libera desde su ficha (REQ-STK-8)", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/stock/ANC-O-3-A");
  const puertas = page.getByRole("region", { name: "Puertas en stock" });
  await expect(puertas.getByRole("row")).toHaveCount(5); // encabezado + 4 puertas
  const codigo = (await puertas.getByRole("link").first().innerText()).trim();
  await puertas.getByRole("link", { name: codigo }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(codigo);
  await expect(page.getByText("Entrada de producción")).toBeVisible();

  const datos = page.getByRole("form", { name: "Datos de la puerta" });
  await datos.getByLabel("Ubicación").fill("galpon arriba");
  await datos.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(datos.getByRole("status")).toContainText("Datos guardados.");
  await expect(page.getByRole("main")).toContainText("Galpón arriba");

  await page.getByRole("button", { name: "Apartar" }).click();
  await page.getByLabel("Para quién").fill("Cliente E2E");
  await page.getByRole("button", { name: "Confirmar: apartar" }).click();
  await expect(page.getByText("Apartada para Cliente E2E").first()).toBeVisible();
  await page.getByRole("button", { name: "Liberar" }).click();
  await page.getByLabel("Motivo").fill("El cliente desistió");
  await page.getByRole("button", { name: "Confirmar: liberar" }).click();
  await expect(page.getByText("Puerta liberada")).toBeVisible();
});

test("las puertas y los despachos anteriores tienen su pestaña en Stock", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/stock");
  await page.getByRole("navigation", { name: "Secciones de stock" }).getByRole("link", { name: "Puertas" }).click();
  await elegirDropdown(page.getByLabel("Ubicación"), "Galpón arriba"); // los filtros se aplican al elegir
  await expect(page).toHaveURL(/ubicacion=/);
  await expect(page.getByRole("region", { name: "Puertas" }).getByRole("row")).toHaveCount(2);
  await page.getByRole("navigation", { name: "Secciones de stock" }).getByRole("link", { name: "Despachos anteriores" }).click();
  await expect(page.getByText("Sin despachos anteriores")).toBeVisible();
});
