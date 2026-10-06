import { expect, test } from "@playwright/test";
import { api, cotizacionId, ingresar, ir } from "./ayudas";
import { ADMIN, CONSULTA } from "./datos";

// Suite 11 (TESTING §3): el usuario solo-consulta (stock.ver) no puede mover stock, aprobar, ver clientes,
// ver costos, importar ni abrir cotizaciones; nada cambia y cada intento queda auditado.
test.describe.configure({ mode: "serial" });

let idA: string;

test("toma el id de la cotización A con el administrador", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  idA = await cotizacionId(page, "estado=aceptada&q=Alerces");
});

test("cada acción prohibida responde 403 y el stock no cambia", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  const antes = (await api(page, "GET", "/api/v1/stock/NEL-R-4-B")).cuerpo;

  const intentos = [
    await api(page, "POST", "/api/v1/movimientos/entradas", { codigo: "NEL-R-4-B", cantidad: 5, referencia: "intento" }),
    await api(page, "POST", "/api/v1/movimientos/ajustes", { codigo: "NEL-R-4-B", cantidad: -2, motivo: "intento" }),
    await api(page, "POST", `/api/v1/cotizaciones/${idA}/aprobar`, { version: 1 }),
    await api(page, "GET", `/api/v1/cotizaciones/${idA}`),
    await api(page, "GET", "/api/v1/clientes"),
    await api(page, "POST", "/api/v1/pedidos", { cotizacionId: idA }),
    await api(page, "GET", "/api/v1/auditoria"),
  ];
  for (const r of intentos) expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
  const importar = await page.request.post("/api/v1/importaciones", {
    headers: { "x-csrf-token": (await api(page, "GET", "/api/v1/sesion")).cuerpo.csrf, "idempotency-key": crypto.randomUUID() },
    multipart: { archivo: { name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") } },
  });
  expect(importar.status()).toBe(403);

  expect((await api(page, "GET", "/api/v1/stock/NEL-R-4-B")).cuerpo).toMatchObject({ existencia: antes.existencia, reservado: antes.reservado });
});

test("ve precios pero nunca costos ni márgenes", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  const r = await api(page, "GET", "/api/v1/listas-precio/3?q=NEL-R-4-B");
  expect(r.cuerpo.datos[0].precioVenta).toBeGreaterThan(0);
  expect(r.cuerpo.datos[0]).not.toHaveProperty("costoTotal");
  expect(r.cuerpo.datos[0]).not.toHaveProperty("margen");
});

test("abrir la cotización A por URL muestra «sin permiso»", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  await ir(page, `/cotizaciones/${idA}`);
  await expect(page.getByText("No tienes permiso para esta sección")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Constructora Los Alerces");
});
