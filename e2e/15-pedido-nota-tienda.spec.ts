import { expect, test } from "@playwright/test";
import { api, elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 15 (TESTING §3; ADR-0008): la tienda envía su nota en PDF → pedido directo → completar reserva → lista →
// despacho. Usa FUY-O-2-A y MAR-O-2X4-B, que ninguna suite anterior deja en stock.
test.describe.configure({ mode: "serial" });

const TIENDA = "Neltume.co (tienda)";

test("registra la tienda como cliente de tipo tienda", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  const form = page.getByRole("form", { name: "Nuevo cliente" });
  await form.getByLabel("Nombre o razón social").fill(TIENDA);
  await form.getByLabel("RUT").fill("76.059.066-5");
  await elegirDropdown(form.getByLabel("Tipo"), "tienda");
  await form.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("main")).toContainText(TIENDA);
});

test("sube el PDF de la nota, revisa la vista previa y crea el pedido al precio de lista", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/pedidos");
  await page.getByRole("link", { name: "Desde nota de la tienda" }).click();
  await page.waitForLoadState("networkidle");
  await elegirDropdown(page.getByLabel("Tienda"), { label: TIENDA });
  await page.getByLabel("PDF de la nota").setInputFiles("e2e/fixtures/nota-tienda-mini.pdf");
  await page.getByRole("button", { name: "Leer nota" }).click();
  const previa = page.getByRole("region", { name: "Vista previa de la nota" });
  await expect(previa).toContainText("Nota N.º 41");
  await expect(previa).toContainText("Medida solicitada: 720 × 2000 mm (Vano)");
  // Rige la lista v2 (+10 %, suite 10): los precios de la nota difieren y prevalece la lista.
  await expect(previa).toContainText("La nota trae $19.000; la lista vigente dice $21.450 (se usa la lista).");
  await page.getByRole("button", { name: "Crear nota de pedido y reservar" }).click();

  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main")).toContainText("Desde la nota N.º 41 de la tienda");
  await expect(page.getByRole("main")).toContainText("proyecto Casa Lago");
  await expect(page.getByLabel("Medio de transporte")).toHaveValue("Camión de fábrica");
  await expect(page.getByRole("button", { name: "Marcar lista" })).toBeDisabled();
});

test("la misma nota no se puede cargar dos veces", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/pedidos/nota-tienda");
  await elegirDropdown(page.getByLabel("Tienda"), { label: TIENDA });
  await page.getByLabel("PDF de la nota").setInputFiles("e2e/fixtures/nota-tienda-mini.pdf");
  await page.getByRole("button", { name: "Leer nota" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ya se cargó" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear nota de pedido y reservar" })).toBeDisabled();
});

test("con stock nuevo se completa la reserva, se marca lista y se despacha", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const lista = await api(page, "GET", "/api/v1/pedidos");
  const pedido = lista.cuerpo.datos.find((p: { refExterna: string | null }) => p.refExterna === "41");
  for (const codigo of ["FUY-O-2-A", "MAR-O-2X4-B"]) {
    expect((await api(page, "POST", "/api/v1/movimientos/entradas", { codigo, cantidad: 3, referencia: "Producción para la tienda" })).estado).toBe(201);
  }
  await ir(page, `/pedidos/${pedido.id}`);
  await page.getByRole("button", { name: "Completar reserva" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reserva actualizada" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("3 de 3 reservadas");
  await page.getByRole("button", { name: "Marcar lista" }).click();
  // A la tienda no se le exige abono ni saldo: se despacha sin pagos ni excepción (REQ-COT-8.17).
  await expect(page.getByRole("main")).toContainText("No exige pago");
  await expect(page.getByRole("button", { name: "Despachar con saldo (excepción)" })).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar despacho" }).click();
  // Se eligen las puertas que salen (vienen marcadas las más antiguas); el marco sale por cantidad (REQ-STK-8.3).
  const fuy = page.getByRole("group", { name: "Puertas de FUY-O-2-A" });
  await expect(fuy).toContainText("3 de 3 elegidas");
  await expect(page.getByRole("group", { name: /MAR-O-2X4-B/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmar despacho" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Despachada el" })).toBeVisible();
  const stock = (await api(page, "GET", "/api/v1/stock/FUY-O-2-A")).cuerpo;
  expect(stock).toMatchObject({ existencia: 0, reservado: 0 });
});
