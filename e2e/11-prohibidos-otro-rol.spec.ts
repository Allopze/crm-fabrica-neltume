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

test("el administrador ve la ficha del cliente con su historial", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/clientes?q=Alerces");
  await page.getByRole("link", { name: /Alerces/ }).first().click();
  await expect(page.getByRole("heading", { name: /Alerces/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cotizaciones recientes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notas de pedido" })).toBeVisible();
});

test("cada acción prohibida responde 403 y el stock no cambia", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  const antes = (await api(page, "GET", "/api/v1/stock/NEL-R-4-B")).cuerpo;

  const intentos = [
    await api(page, "POST", "/api/v1/movimientos/entradas", { codigo: "NEL-R-4-B", cantidad: 5, referencia: "intento" }),
    await api(page, "POST", "/api/v1/movimientos/ajustes", { codigo: "NEL-R-4-B", cantidad: -2, motivo: "intento" }),
    await api(page, "POST", `/api/v1/cotizaciones/${idA}/aprobar`, { version: 1 }),
    await api(page, "GET", "/api/v1/clientes"),
    await api(page, "POST", "/api/v1/pedidos", { cotizacionId: idA }),
    await api(page, "GET", "/api/v1/auditoria"),
  ];
  for (const r of intentos) expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
  // Una cotización que no puede ver responde como si no existiera (REQ-COT-10.2).
  expect((await api(page, "GET", `/api/v1/cotizaciones/${idA}`)).cuerpo.error.codigo).toBe("NO_ENCONTRADO");
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

test("el menú no ofrece secciones sin permiso", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Stock de puertas" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Cotizaciones" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Notas de pedido" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Usuarios y permisos" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Auditoría" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Ajustes de IA" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nueva cotización" })).toHaveCount(0);
});

test("abrir la cotización A por URL responde como si no existiera", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  await ir(page, `/cotizaciones/${idA}`);
  await expect(page.getByText("No encontramos lo que buscas")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Constructora Los Alerces");
});
