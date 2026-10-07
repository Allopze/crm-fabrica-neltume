import { expect, type Page, test } from "@playwright/test";
import { csrf, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 04 (TESTING §3): BOM demo de Neltume, orden de 2 NEL-R-4-B, cierre, y los tres rechazos del cierre.
// Deja 2 NEL-R-4-B en stock para la suite del cotizador.
test.describe.configure({ mode: "serial" });

async function ordenesAbiertas(page: Page) {
  const datos = (await (await page.request.get("/api/v1/ordenes")).json()).datos as { id: string; numero: number; estado: string; lineas: { codigo: string }[] }[];
  return datos.filter((o) => o.estado === "abierta");
}

test("define el BOM de demostración de Neltume", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/produccion?vista=recetas");
  await page.getByRole("button", { name: "Definir BOM" }).click();
  const form = page.getByRole("form", { name: "Definir BOM" });
  await form.getByLabel("Modelo").selectOption("NEL");
  await form.getByLabel("Origen").selectOption("demo");
  const insumos: [string, string][] = [["Tabla raulí 1\"", "6"], ["Cola vinílica D3", "0,4"], ["Lija grano 120", "3"]];
  for (const [i, [mp, cant]] of insumos.entries()) {
    if (i > 0) await form.getByRole("button", { name: "Agregar insumo" }).click();
    await form.getByLabel(`Materia prima ${i + 1}`).selectOption({ label: `${mp} (${mp.startsWith("Tabla") ? "pulg" : mp.startsWith("Cola") ? "lt" : "un"})` });
    await form.getByLabel(`Cantidad ${i + 1}`).fill(cant);
  }
  await form.getByRole("button", { name: "Guardar BOM" }).click();
  await expect(page.getByText("DEMO").first()).toBeVisible();
  // «Editar» abre la receta vigente precargada, sin reescribirla.
  await page.getByRole("link", { name: "Editar BOM de Neltume" }).click();
  const edicion = page.getByRole("form", { name: "Editar BOM de Neltume" });
  await expect(edicion.getByLabel("Cantidad 1")).not.toHaveValue("");
  await expect(edicion.getByLabel("Cantidad 3")).toBeVisible();
  await edicion.getByRole("button", { name: "Cancelar" }).click();
  await expect(edicion).toBeHidden();
});

test("crea y cierra una orden de 2 NEL-R-4-B: consume insumos y suma puertas", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/produccion");
  await page.getByRole("button", { name: "Nueva orden" }).click();
  const form = page.getByRole("form", { name: "Nueva orden" });
  await form.getByLabel("Artículo").fill("NEL-R-4-B");
  await form.getByLabel("Cantidad").fill("2");
  await form.getByRole("button", { name: "Crear orden" }).click();
  await expect(page.getByText("BOM DEMO")).toBeVisible();
  // La vista previa del cierre nombra el insumo (en la tabla de recetas los insumos van plegados).
  const cierre = page.locator("section").filter({ has: page.getByRole("heading", { name: /Cerrar orden/ }) });
  await expect(cierre.getByText("Tabla raulí").first()).toBeVisible();
  await page.getByRole("button", { name: /Cerrar orden N\.º \d+ y mover stock/ }).click();
  // Mover stock es irreversible: primero se confirma, y el resultado queda a la vista sin saltar a otra orden.
  await page.getByRole("group", { name: /Confirmar cierre de la orden/ }).getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(page.getByText(/Orden N\.º \d+ cerrada/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Cerrada" })).toBeVisible();
  await ir(page, "/stock/NEL-R-4-B");
  await expect(page.getByText("Existencia").locator("..")).toContainText("2");
  await ir(page, "/materias-primas");
  await expect(page.getByRole("row").filter({ hasText: "Tabla raulí" })).toContainText("388");
});

test("cerrar de nuevo, sin BOM o sin insumos suficientes → 409 sin mover nada", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const token = await csrf(page);
  const post = (url: string, data: object = {}) => page.request.post(url, { headers: { "x-csrf-token": token, "idempotency-key": crypto.randomUUID() }, data });
  const todas = (await (await page.request.get("/api/v1/ordenes")).json()).datos as { id: string; estado: string }[];
  const cerrada = todas.find((o) => o.estado === "cerrada")!;
  expect((await (await post(`/api/v1/ordenes/${cerrada.id}/cerrar`)).json()).error.codigo).toBe("ORDEN_CERRADA");

  await post("/api/v1/ordenes", { lineas: [{ codigo: "FUY-O-2-A", cantidad: 1 }] });
  await post("/api/v1/ordenes", { lineas: [{ codigo: "NEL-R-3-B", cantidad: 100 }] });
  const [sinBom, grande] = await ordenesAbiertas(page).then((os) => [os.find((o) => o.lineas[0].codigo === "FUY-O-2-A")!, os.find((o) => o.lineas[0].codigo === "NEL-R-3-B")!]);
  expect((await (await post(`/api/v1/ordenes/${sinBom.id}/cerrar`)).json()).error.codigo).toBe("SIN_BOM");
  expect((await (await post(`/api/v1/ordenes/${grande.id}/cerrar`)).json()).error.codigo).toBe("INSUMOS_INSUFICIENTES");
  for (const o of [sinBom, grande]) expect((await post(`/api/v1/ordenes/${o.id}/anular`)).status()).toBe(204);
  await ir(page, "/stock/NEL-R-4-B");
  await expect(page.getByText("Existencia").locator("..")).toContainText("2");
});
