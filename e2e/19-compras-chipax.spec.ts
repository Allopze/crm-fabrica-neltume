import { expect, type Page, test } from "@playwright/test";
import { api, elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN, PROVEEDOR_CHIPAX } from "./datos";

// Suite 19 (TESTING §3; ADR-0021): con un Chipax simulado y el servicio de compras real, se habilita un proveedor,
// se sincroniza, se asocia el tablón (sube el stock) y se ignora el flete; la factura siguiente entra sola y repetir
// la sincronización no duplica.
test.describe.configure({ mode: "serial" });

const MATERIA = "Tablón pino oregón (Chipax)";
// Chipax simulado (playwright.config.ts: puerto de la app + 3).
const CHIPAX = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PUERTO || 3200) + 3}`;

const existencia = async (page: Page) =>
  (await api(page, "GET", "/api/v1/materias-primas")).cuerpo.datos.find((m: { nombre: string }) => m.nombre === MATERIA)?.existencia ?? 0;

/** Pulsa «Sincronizar ahora» y espera a que el servicio termine la corrida. */
async function sincronizar(page: Page) {
  await page.getByRole("button", { name: "Sincronizar ahora" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sincronización pedida." })).toBeVisible();
  await expect.poll(async () => {
    const s = (await api(page, "GET", "/api/v1/compras/sincronizacion")).cuerpo;
    return !s.pendiente && Boolean(s.ultima?.fin);
  }, { timeout: 20_000 }).toBe(true);
  await ir(page, "/materias-primas/compras");
}

test("habilitar un proveedor y asociar sus ítems sube el stock; el flete queda como «no es materia prima»", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  expect((await api(page, "POST", "/api/v1/materias-primas", { nombre: MATERIA, unidadCodigo: "pulg" })).estado).toBe(201);
  await ir(page, "/materias-primas");
  await page.getByRole("link", { name: "Compras (Chipax)" }).click();
  await expect(page.getByRole("heading", { name: "Compras desde Chipax" })).toBeVisible();

  await page.getByLabel("RUT del proveedor").fill(PROVEEDOR_CHIPAX.rut);
  await page.getByLabel("Nombre del proveedor").fill(PROVEEDOR_CHIPAX.nombre);
  await page.getByRole("button", { name: "Habilitar proveedor" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proveedor habilitado" })).toBeVisible();

  await sincronizar(page);
  await expect(page.getByRole("heading", { name: "Por asociar (2)" })).toBeVisible();
  expect(await existencia(page)).toBe(0);

  const tablon = page.getByRole("listitem").filter({ hasText: "Tablón pino oregón 2x8" });
  await elegirDropdown(tablon.getByLabel("Materia prima para Tablón pino oregón 2x8"), { label: `${MATERIA} (pulg)` });
  await tablon.getByLabel("Factor para Tablón pino oregón 2x8").fill("424");
  await expect(tablon).toContainText("2 M3 × 424 = 848 pulg");
  await tablon.getByRole("button", { name: "Asociar y recibir" }).click();
  // La línea sale de «Por asociar» y el stock sube.
  await expect(page.getByRole("heading", { name: "Por asociar (1)" })).toBeVisible();
  await expect.poll(() => existencia(page)).toBe(848);

  await page.getByRole("listitem").filter({ hasText: "Flete a Panguipulli" }).getByRole("button", { name: "No es materia prima" }).click();
  await expect(page.getByRole("main")).toContainText("Nada por asociar");
});

test("la factura siguiente con el mismo ítem entra sola y repetir la sincronización no duplica", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/materias-primas/compras");
  // El proveedor emite una segunda factura con el mismo tablón.
  expect((await page.request.post(`${CHIPAX}/control/segunda`)).ok()).toBe(true);
  await sincronizar(page);
  await expect.poll(() => existencia(page)).toBe(848 + 636);
  await expect(page.getByRole("main")).toContainText("Factura 5002");

  await sincronizar(page);
  expect(await existencia(page)).toBe(848 + 636);

  // En Recepción manual se avisa que esta materia prima ya entra sola desde Chipax.
  const mp = (await api(page, "GET", "/api/v1/materias-primas")).cuerpo.datos.find((m: { nombre: string }) => m.nombre === MATERIA);
  await ir(page, `/materias-primas?recibir=${mp.id}`);
  await expect(page.getByRole("note")).toContainText(`entra sola con las facturas de ${PROVEEDOR_CHIPAX.nombre}`);
});
