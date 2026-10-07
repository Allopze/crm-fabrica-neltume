import { expect, type Page } from "@playwright/test";

const vigiladas = new WeakSet<Page>();

/** Una violación de la Content-Security-Policy (src/proxy.ts) en la consola falla el test (auditoría M-01). */
export function vigilarCsp(page: Page) {
  if (vigiladas.has(page)) return;
  vigiladas.add(page);
  page.on("console", (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) expect.soft(m.text(), "violación de CSP").toBe("");
  });
}

export async function ingresar(page: Page, email: string, clave: string, exito = true) {
  vigilarCsp(page);
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  if (exito) await expect(page).toHaveURL(/\/$/);
}

export async function csrf(page: Page): Promise<string> {
  const r = await page.request.get("/api/v1/sesion");
  return (await r.json()).csrf;
}

/** Navega y espera a que la página termine de cargar e hidratar antes de interactuar. */
export async function ir(page: Page, ruta: string) {
  await page.goto(ruta);
  await page.waitForLoadState("networkidle");
}

/** Llamada JSON a la API con la sesión de la página (CSRF y, en mutaciones, Idempotency-Key). */
export async function api(page: Page, metodo: "GET" | "POST" | "PATCH" | "DELETE", ruta: string, cuerpo?: unknown) {
  const headers: Record<string, string> = metodo === "GET" ? {} : { "x-csrf-token": await csrf(page), "idempotency-key": crypto.randomUUID() };
  const r = await page.request.fetch(ruta, { method: metodo, headers, data: cuerpo });
  return { estado: r.status(), cuerpo: await r.json().catch(() => null), res: r };
}

/** Id de la cotización más reciente que cumple el filtro (las suites se encadenan por estado, no por variables). */
export async function cotizacionId(page: Page, filtro: string): Promise<string> {
  const r = await api(page, "GET", `/api/v1/cotizaciones?${filtro}`);
  expect(r.cuerpo.datos.length, `sin cotización para ${filtro}`).toBeGreaterThan(0);
  return r.cuerpo.datos[0].id;
}
