import { expect, type Page, test } from "@playwright/test";
import { api, elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN, CLIENTE_A } from "./datos";

// Suite 18 (TESTING §3; ADR-0020): sin abono no se produce y con saldo no se despacha; los pagos se registran en la
// ficha, un error se revierte con motivo y una cancelación con abono lo deja anotado. Usa RAN-L-3-B, sin stock previo.
test.describe.configure({ mode: "serial" });

const CODIGO = "RAN-L-3-B";

/** Nota de pedido nueva desde una cotización manual aprobada (camino ya probado en 09). */
async function pedidoNuevo(page: Page, cantidad: number): Promise<string> {
  const clienteId = (await api(page, "GET", `/api/v1/clientes?q=${encodeURIComponent(CLIENTE_A.nombre)}`)).cuerpo.datos[0].id;
  const cot = (await api(page, "POST", "/api/v1/cotizaciones", { clienteId, items: [{ codigo: CODIGO, cantidad }] })).cuerpo.id;
  expect((await api(page, "POST", `/api/v1/cotizaciones/${cot}/aprobar`, { version: 1 })).estado).toBe(200);
  return (await api(page, "POST", "/api/v1/pedidos", { cotizacionId: cot })).cuerpo.id;
}
const etiquetaPago = (page: Page, texto: string) => page.getByRole("main").locator("header").getByText(texto, { exact: true });

test("sin abono no se produce; con el 50 % registrado, sí", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await pedidoNuevo(page, 2);
  await ir(page, `/pedidos/${id}`);
  await expect(etiquetaPago(page, "Sin abono")).toBeVisible();
  await expect(page.getByRole("button", { name: "Producir faltante (2)" })).toBeDisabled();
  await expect(page.getByRole("main")).toContainText("Falta el abono");

  await page.getByRole("button", { name: "Registrar pago" }).click();
  const { pago } = (await api(page, "GET", `/api/v1/pedidos/${id}`)).cuerpo;
  await expect(page.getByLabel("Monto (CLP)")).toHaveValue(String(pago.abonoRequerido));
  await page.getByLabel("N.º de comprobante (opcional)").fill("TRF-1001");
  await page.getByRole("button", { name: /^Registrar \$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pago registrado." })).toBeVisible();
  await expect(etiquetaPago(page, "Abonado")).toBeVisible();

  await page.getByRole("button", { name: "Producir faltante (2)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pedido en producción." })).toBeVisible();
});

test("con saldo no se despacha; pagado el saldo, sí", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = (await api(page, "GET", "/api/v1/pedidos?estado=en_produccion&estadoPago=abonado")).cuerpo.datos[0].id;
  expect((await api(page, "POST", "/api/v1/movimientos/entradas", { codigo: CODIGO, cantidad: 2, referencia: "Producción" })).estado).toBe(201);
  await ir(page, `/pedidos/${id}`);
  await page.getByRole("button", { name: "Completar reserva" }).click();
  await expect(page.getByRole("status").filter({ hasText: "ya se puede marcar lista" })).toBeVisible();
  await page.getByRole("button", { name: "Marcar lista" }).click();
  await expect(page.getByRole("button", { name: "Registrar despacho" })).toBeDisabled();
  await expect(page.getByRole("main")).toContainText("Falta pagar el saldo");

  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByRole("button", { name: /^Saldo completo/ }).click();
  await elegirDropdown(page.getByLabel("Medio de pago"), "efectivo");
  await page.getByRole("button", { name: /^Registrar \$/ }).click();
  await expect(etiquetaPago(page, "Pagado")).toBeVisible();

  await page.getByRole("button", { name: "Registrar despacho" }).click();
  await page.getByRole("button", { name: "Confirmar despacho" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Despachada el" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Pagos registrados" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("main")).toContainText("Pago registrado");
});

test("un pago se revierte con motivo y la nota vuelve a quedar sin abono", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await pedidoNuevo(page, 1);
  await ir(page, `/pedidos/${id}`);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByRole("button", { name: /^Saldo completo/ }).click();
  await page.getByRole("button", { name: /^Registrar \$/ }).click();
  await expect(etiquetaPago(page, "Pagado")).toBeVisible();

  await page.getByRole("button", { name: "Revertir" }).click();
  await page.getByLabel("Motivo del reverso").fill("Transferencia rechazada por el banco");
  await page.getByRole("button", { name: "Confirmar reverso" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pago revertido." })).toBeVisible();
  await expect(etiquetaPago(page, "Sin abono")).toBeVisible();
  await expect(page.getByRole("list", { name: "Pagos registrados" })).toContainText("Reverso: Transferencia rechazada por el banco");
  // Queda en el panel como pedido por atender.
  await ir(page, "/");
  await expect(page.getByRole("heading", { name: "Pedidos por atender" })).toBeVisible();
});

test("cancelar una nota con abono deja anotado lo pagado", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await pedidoNuevo(page, 1);
  const { pago } = (await api(page, "GET", `/api/v1/pedidos/${id}`)).cuerpo;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  expect((await api(page, "POST", `/api/v1/pedidos/${id}/pagos`, { monto: pago.abonoRequerido, fecha: hoy, medio: "transferencia" })).estado).toBe(201);
  await ir(page, `/pedidos/${id}`);
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await page.getByLabel("Motivo de la cancelación").fill("El cliente desistió");
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByRole("status").filter({ hasText: "sin devolución registrada" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);
});

test("la lista filtra por estado de pago y la auditoría registra cada pago", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/pedidos");
  await page.getByRole("navigation", { name: "Filtrar por pago" }).getByRole("link", { name: /^Pagado/ }).click();
  await expect(page).toHaveURL(/pago=pagado/);
  const filas = page.getByRole("main").locator("tbody tr");
  await expect(filas.first()).toContainText("Pagado");
  await expect(filas.filter({ hasText: "Sin abono" })).toHaveCount(0);
  const a = await api(page, "GET", "/api/v1/auditoria?accion=pago&limite=50");
  const acciones = a.cuerpo.datos.map((x: { accion: string }) => x.accion);
  expect(acciones).toEqual(expect.arrayContaining(["registrar pago", "revertir pago"]));
});
