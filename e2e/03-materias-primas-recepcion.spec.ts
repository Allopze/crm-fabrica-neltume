import { expect, test } from "@playwright/test";
import { csrf, elegirDropdown, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 03 (TESTING §3): alta de 3 materias primas y recepción idempotente. Deja stock de MP para la suite 04.
test.describe.configure({ mode: "serial" });

const MATERIAS = [["Tabla raulí 1\"", "pulg", "300"], ["Cola vinílica D3", "lt", "20"], ["Lija grano 120", "un", ""]];

test("crea 3 materias primas con su unidad", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/materias-primas");
  for (const [nombre, unidad, minimo] of MATERIAS) {
    const form = page.getByRole("form", { name: "Nueva materia prima" });
    // El panel lateral queda abierto para cargar varias seguidas: solo se abre la primera vez.
    if (!(await form.isVisible())) await page.getByRole("button", { name: "Nueva materia prima" }).click();
    await form.getByLabel("Nombre").fill(nombre);
    await elegirDropdown(form.getByLabel("Unidad"), unidad);
    if (minimo) await form.getByLabel("Mínimo").fill(minimo);
    await form.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByRole("cell", { name: nombre, exact: true })).toBeVisible();
  }
});

test("registra una recepción desde la UI", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/materias-primas");
  const form = page.getByRole("form", { name: "Registrar recepción" });
  await elegirDropdown(form.getByLabel("Materia prima"), { label: "Tabla raulí 1\"" });
  await form.getByLabel("Cantidad").fill("400");
  await form.getByLabel("Guía o factura").fill("Guía 18.442");
  await form.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Tabla raulí" })).toContainText("400");
});

test("un doble envío de la misma recepción cuenta una sola vez", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const token = await csrf(page);
  const mps = (await (await page.request.get("/api/v1/materias-primas")).json()).datos as { id: string; nombre: string }[];
  const cola = mps.find((m) => m.nombre === "Cola vinílica D3")!;
  const lija = mps.find((m) => m.nombre === "Lija grano 120")!;
  const clave = crypto.randomUUID();
  for (let i = 0; i < 2; i++) {
    const r = await page.request.post("/api/v1/recepciones", { headers: { "x-csrf-token": token, "idempotency-key": clave }, data: { materiaPrimaId: cola.id, cantidad: 30 } });
    expect(r.status()).toBe(201);
  }
  await page.request.post("/api/v1/recepciones", { headers: { "x-csrf-token": token, "idempotency-key": crypto.randomUUID() }, data: { materiaPrimaId: lija.id, cantidad: 100 } });
  await ir(page, "/materias-primas");
  await expect(page.getByRole("row").filter({ hasText: "Cola vinílica" })).toContainText("30");
});
