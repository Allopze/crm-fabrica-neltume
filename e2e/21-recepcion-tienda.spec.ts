import { type APIRequestContext, expect, test } from "@playwright/test";
import { api, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";
import { cabecerasFirmadas, claveDe, lineaTienda, mensajeListo } from "../tests/fixtures/tienda/mensaje";

// Suite 21 (TESTING §3; ADR-0023): la tienda envía su nota firmada por la API, sin sesión ni botón de importar; aparece
// en Notas de pedido con sus dos documentos, producción la ve e imprime sin importes, y una revisión con la nota en
// producción espera a una persona. Usa el cliente tienda que registra la suite 15.
test.describe.configure({ mode: "serial" });

const NUMERO = "801";
const PRODUCCION = { email: "produccion@e2e.neltume.cl", nombre: "Producción E2E", clave: "clave-e2e-solo-pruebas-3" };
let sourceOrderId = "";

async function enviar(request: APIRequestContext, mensaje: Awaited<ReturnType<typeof mensajeListo>>, firma?: Record<string, string>) {
  const cuerpo = Buffer.from(JSON.stringify(mensaje));
  const r = await request.post("/api/integrations/neltume/orders", { data: cuerpo, headers: firma ?? cabecerasFirmadas(new Uint8Array(cuerpo), claveDe(mensaje)) });
  return { estado: r.status(), cuerpo: await r.json() };
}

const notaId = async (page: import("@playwright/test").Page) => {
  const r = await api(page, "GET", "/api/v1/pedidos?limite=200");
  return (r.cuerpo.datos as { id: string; refExterna: string | null; estado: string }[]).find((p) => p.refExterna === NUMERO && p.estado !== "cancelada")!.id;
};

test("la nota llega sola por la API firmada; sin firma válida se rechaza", async ({ request }) => {
  const m = await mensajeListo({ numero: NUMERO });
  sourceOrderId = m.sourceOrderId;
  expect((await enviar(request, m, { "content-type": "application/json", "x-idempotency-key": claveDe(m) })).estado).toBe(401);
  const r = await enviar(request, m);
  expect(r).toMatchObject({ estado: 201, cuerpo: { status: "accepted", eventId: m.eventId } });
  // Un reintento de red no duplica.
  expect((await enviar(request, m)).cuerpo.status).toBe("duplicate");
});

test("aparece en Notas de pedido con sus documentos y la orden de trabajo se descarga", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/pedidos");
  const fila = page.getByRole("row", { name: new RegExp(`Nota de la tienda N\\.º ${NUMERO}`) });
  await expect(fila).toContainText("Recibida automáticamente");
  await fila.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}$/);
  const main = page.getByRole("main");
  await expect(main).toContainText(`Desde la nota N.º ${NUMERO} de la tienda, recibida automáticamente`);
  await expect(main).toContainText("Medida solicitada: 720 × 2000 mm (Hoja)");
  await expect(main).toContainText("Bisagras a la derecha");
  await expect(main.getByRole("link", { name: "Nota comercial de la tienda (con precios)" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Orden de trabajo de la tienda (sin precios)" })).toBeVisible();
  const descarga = page.waitForEvent("download");
  await page.getByRole("link", { name: "Orden de trabajo", exact: true }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^Neltume - Orden de trabajo N\.º \d+\.pdf$/);
});

test("producción ve e imprime la nota sin un solo importe", async ({ page, browser }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const rol = await api(page, "POST", "/api/v1/roles", { nombre: "produccion", permisos: ["pedidos.gestionar", "produccion.gestionar", "stock.ver"] });
  expect(rol.estado).toBe(201);
  expect((await api(page, "POST", "/api/v1/usuarios", { ...PRODUCCION, rolId: rol.cuerpo.id })).estado).toBe(201);
  const id = await notaId(page);

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CL", timezoneId: "America/Santiago" });
  const p = await contexto.newPage();
  await ingresar(p, PRODUCCION.email, PRODUCCION.clave);
  await ir(p, `/pedidos/${id}`);
  const main = p.getByRole("main");
  await expect(main).toContainText("Medida solicitada: 720 × 2000 mm (Hoja)");
  await expect(main.getByRole("link", { name: "Orden de trabajo", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Orden de trabajo de la tienda (sin precios)" })).toBeVisible();
  await expect(main.getByRole("link", { name: "PDF", exact: true })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Nota comercial/ })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Pagos" })).toHaveCount(0);
  expect(await main.innerText()).not.toContain("$");
  expect((await p.request.get(`/api/v1/pedidos/${id}/documentos/comercial`)).status()).toBe(404);
  expect((await p.request.get(`/api/v1/pedidos/${id}/orden-trabajo`)).headers()["content-type"]).toBe("application/pdf");
  await contexto.close();
});

test("una revisión con la nota en producción espera a una persona, que la aplica", async ({ page, request }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await notaId(page);
  expect((await api(page, "POST", `/api/v1/pedidos/${id}/produccion`)).estado).toBe(200);
  const rev = await mensajeListo({ numero: NUMERO, sourceOrderId, revision: 2, items: [lineaTienda(1, "FUY-O-2-A", 5)] });
  expect((await enviar(request, rev)).estado).toBe(202);

  await ir(page, `/pedidos/${id}`);
  const aviso = page.getByRole("status", { name: "Revisión de la tienda" });
  await expect(aviso).toContainText(`La tienda envió la revisión 2 de la nota N.º ${NUMERO}`);
  await aviso.getByRole("button", { name: "Aplicar la revisión" }).click();
  await aviso.getByLabel("Motivo").fill("Confirmado por teléfono con la tienda");
  await aviso.getByRole("button", { name: "Aplicar la revisión" }).click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page.getByRole("main")).toContainText(`Desde la nota N.º ${NUMERO} (rev. 2) de la tienda`);
  await expect(page.getByRole("main")).toContainText(/\d de 5 reservadas/);
});
