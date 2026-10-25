import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { api, ingresar, ir } from "./ayudas";
import { ADMIN, CONSULTA } from "./datos";
import { cabecerasFirmadas } from "../tests/fixtures/tienda/mensaje";
import { clavePruebaTienda, mensajePruebaTienda } from "../tests/fixtures/tienda/prueba-conexion";

// Suite 22 (TESTING §3; ADR-0024, REQ-ADM-5.1–5.4): Ajustes → «Conexión con la tienda». El administrador envía un PDF de
// prueba (la app lo firma y el servicio de enlace lo entrega a una tienda simulada), ve el resultado, ve por qué falla cuando
// falla, y la prueba que manda la tienda por la ruta firmada aparece en la lista sin crear pedidos.
test.describe.configure({ mode: "serial" });

const PUERTO = Number(process.env.PLAYWRIGHT_PUERTO || 3200);
const TIENDA = `http://127.0.0.1:${PUERTO + 5}`;
const RUTA = "/api/integrations/neltume/connection-tests";
const dirigir = (request: APIRequestContext, cuerpo: object) => request.post(`${TIENDA}/control`, { data: cuerpo });
const vistoPorLaTienda = async (request: APIRequestContext) => (await request.get(`${TIENDA}/control`)).json();

const abrir = async (page: Page) => {
  await ir(page, "/administracion/tienda");
  await expect(page.getByRole("heading", { name: "Conexión con la tienda", level: 1 })).toBeVisible();
};
const boton = (page: Page) => page.getByRole("button", { name: /Enviar PDF de prueba a la tienda|Enviando…/ });
const resultado = (page: Page) => page.getByRole("group", { name: "Resultado de la prueba" });
async function probar(page: Page) {
  await expect(boton(page)).toBeEnabled();
  await boton(page).click();
}
const firmado = (m: { eventId: string }) => {
  const cuerpo = Buffer.from(JSON.stringify(m));
  return { data: cuerpo, headers: cabecerasFirmadas(new Uint8Array(cuerpo), clavePruebaTienda(m)) };
};

test("el administrador envía el PDF de prueba: la tienda lo recibe firmado y la pantalla muestra el resultado y el PDF", async ({ page, request }) => {
  await dirigir(request, { reiniciar: true });
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Conexión con la tienda" })).toBeVisible();
  await abrir(page);
  const main = page.getByRole("main");
  await expect(main).toContainText("Recepción activa");
  await expect(main).toContainText("Lista para firmar");
  await expect(main).toContainText("Aún no hay pruebas");

  await probar(page);
  await expect(resultado(page)).toContainText(/Aceptada en [\d.]+ ms\./, { timeout: 20_000 });
  await expect(resultado(page)).toContainText("Busca el PDF con el código");

  // La tienda simulada recibió los bytes firmados por la app, con la clave de idempotencia del contrato.
  const visto = await vistoPorLaTienda(request);
  expect(visto.recibidas).toHaveLength(1);
  expect(visto.recibidas[0]).toMatchObject({ firmaValida: true, source: "neltume-factory", factoryCode: "PANGUIPULLI", pdfValido: true });
  expect(visto.recibidas[0].clave).toBe(`neltume-factory:connection-test:${visto.recibidas[0].eventId}`);

  // La lista y el estado se ponen al día, y el PDF se abre en el visor (privado, sin sandbox).
  const fila = page.getByRole("row", { name: /Enviada a la tienda/ });
  await expect(fila).toContainText("Aceptada");
  await expect(main).toContainText(`Último destino: 127.0.0.1:${PUERTO + 5}`);
  const href = (await fila.getByRole("link", { name: /Ver PDF de la prueba/ }).getAttribute("href"))!;
  const pdf = await page.request.get(href);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(pdf.headers()["content-security-policy"]).toBeUndefined();
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // Quién la pidió y qué hizo el servicio quedan en la auditoría.
  const aud = await api(page, "GET", "/api/v1/auditoria?recurso=prueba_conexion");
  const hechos = (aud.cuerpo.datos as { accion: string; origen: string }[]).map((a) => `${a.accion} (${a.origen})`);
  expect(hechos).toEqual(expect.arrayContaining(["solicitar prueba de conexion (web)", "enviar prueba de conexion (enlace)"]));
});

test("cuando la tienda no la acepta, la pantalla dice por qué", async ({ page, request }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await abrir(page);
  const casos: [string, string, RegExp][] = [
    ["401", "La tienda rechazó la prueba", /rechazó la firma: el secreto no coincide o los relojes difieren en más de 5 minutos/],
    ["403", "La tienda rechazó la prueba", /rechazó el acceso \(403\): revisa el Host permitido o el acceso por Cloudflare/],
    ["404", "La tienda rechazó la prueba", /aún no tiene esta ruta \(versión sin desplegar\)/],
    ["503", "La tienda rechazó la prueba", /no tiene configurada la integración/],
    ["422", "La tienda rechazó la prueba", /rechazó la prueba \(422\): document_invalid/],
    ["otra_app", "La tienda rechazó la prueba", /Respondió otra aplicación/],
    ["redireccion", "No hubo respuesta de la tienda", /redirección inesperada \(¿Cloudflare Access\?\)/],
    ["colgar", "No hubo respuesta de la tienda", /sin respuesta en 1\.500 ms/],
  ];
  for (const [modo, titulo, detalle] of casos) {
    await dirigir(request, { modo });
    await probar(page);
    await expect(resultado(page), modo).toContainText(titulo, { timeout: 20_000 });
    await expect(resultado(page), modo).toContainText(detalle);
  }
  // Cada intento quedó en la lista con su resultado.
  await expect(page.getByRole("row", { name: /Enviada a la tienda/ })).toHaveCount(1 + casos.length);
  await expect(page.getByRole("row", { name: /Enviada a la tienda.*Rechazada/ })).toHaveCount(6);
  await expect(page.getByRole("row", { name: /Enviada a la tienda.*Sin respuesta/ })).toHaveCount(2);

  // Un reloj muy desfasado no hace fallar la prueba, pero avisa (la firma solo vale ±300 s).
  await dirigir(request, { modo: "reloj" });
  await probar(page);
  await expect(resultado(page)).toContainText("Aceptada en", { timeout: 20_000 });
  await expect(resultado(page)).toContainText(/Aviso: el reloj de la tienda difiere 30\d s del nuestro/);
  await dirigir(request, { reiniciar: true });
});

test("la tienda envía su prueba por la ruta firmada: aparece en la lista con su PDF, sin crear pedidos", async ({ page, request }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const pedidosAntes = (await api(page, "GET", "/api/v1/pedidos?limite=200")).cuerpo.datos.length;
  const m = await mensajePruebaTienda();

  // Sin firma válida o con otro método, la ruta no responde nada útil.
  const sinFirma = await request.post(RUTA, { data: Buffer.from(JSON.stringify(m)), headers: { "content-type": "application/json", "x-idempotency-key": clavePruebaTienda(m) } });
  expect(sinFirma.status()).toBe(401);
  // Todo lo que no sea POST es 405 (contrato §3), también OPTIONS, que Next responde con 204 si nadie lo declara.
  for (const metodo of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect((await request.fetch(RUTA, { method: metodo })).status(), metodo).toBe(405);

  const ok = await request.post(RUTA, firmado(m));
  expect(ok.status()).toBe(201);
  expect(await ok.json()).toMatchObject({ status: "accepted", eventId: m.eventId, receiver: "neltume-factory" });
  // Un reintento de red no duplica.
  const otra = await request.post(RUTA, firmado(m));
  expect(otra.status()).toBe(200);
  expect(await otra.json()).toMatchObject({ status: "duplicate" });

  await abrir(page);
  const fila = page.getByRole("row", { name: /Recibida de la tienda/ }).filter({ hasText: m.eventId.slice(0, 8) });
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("Recibida");
  const href = (await fila.getByRole("link", { name: /Ver PDF de la prueba/ }).getAttribute("href"))!;
  const pdf = await page.request.get(href);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).toString("base64")).toBe(m.document.contentBase64);
  // Una prueba no es un pedido.
  expect((await api(page, "GET", "/api/v1/pedidos?limite=200")).cuerpo.datos.length).toBe(pedidosAntes);
});

test("con la pantalla abierta, la prueba que manda la tienda aparece sola", async ({ page, request }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await abrir(page);
  const m = await mensajePruebaTienda();
  expect((await request.post(RUTA, firmado(m))).status()).toBe(201);
  await expect(page.getByRole("row", { name: /Recibida de la tienda/ }).filter({ hasText: m.eventId.slice(0, 8) })).toBeVisible({ timeout: 25_000 });
});

test("sin config.editar no hay acceso: ni menú, ni pantalla, ni API", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Conexión con la tienda" })).toHaveCount(0);
  await ir(page, "/administracion/tienda");
  await expect(page.getByText("No tienes permiso para esta sección")).toBeVisible();
  const id = "00000000-0000-4000-8000-000000000000";
  for (const r of [
    await api(page, "GET", "/api/v1/integracion/tienda/pruebas"), await api(page, "POST", "/api/v1/integracion/tienda/pruebas"),
    await api(page, "GET", `/api/v1/integracion/tienda/pruebas/${id}`), await api(page, "GET", `/api/v1/integracion/tienda/pruebas/${id}/pdf`),
  ]) expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
});
