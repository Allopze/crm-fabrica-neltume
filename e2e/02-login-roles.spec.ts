import { expect, test } from "@playwright/test";
import { csrf, ingresar } from "./ayudas";
import { ADMIN, CONSULTA } from "./datos";

// Suite 02 (TESTING §3): login, rol de prueba solo-consulta y regla del último administrador.
test.describe.configure({ mode: "serial" });

test("login con clave incorrecta muestra un error que no revela el motivo", async ({ page }) => {
  await ingresar(page, ADMIN.email, "clave-equivocada-123", false);
  await expect(page.locator("form").getByRole("alert")).toContainText("Correo o contraseña incorrectos.");
  await expect(page).toHaveURL(/\/login$/);
});

test("el administrador ingresa, crea el rol solo-consulta y un usuario con ese rol", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(ADMIN.nombre)).toBeVisible();

  const token = await csrf(page);
  const rol = await page.request.post("/api/v1/roles", { headers: { "x-csrf-token": token }, data: { nombre: "solo-consulta", permisos: ["stock.ver"] } });
  expect(rol.status()).toBe(201);
  const rolId = (await rol.json()).id;
  const u = await page.request.post("/api/v1/usuarios", { headers: { "x-csrf-token": token }, data: { ...CONSULTA, rolId } });
  expect(u.status()).toBe(201);

  await page.goto("/administracion");
  await expect(page.getByRole("cell", { name: CONSULTA.email })).toBeVisible();
});

test("no se puede desactivar al último usuario que gestiona usuarios", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await page.goto("/administracion");
  const fila = page.getByRole("row").filter({ hasText: ADMIN.email });
  await fila.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("al menos un usuario activo");
  await expect(fila.getByText("Activo")).toBeVisible();
});

test("el usuario solo-consulta no ve la administración y el backend lo rechaza", async ({ page }) => {
  await ingresar(page, CONSULTA.email, CONSULTA.clave);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/administracion");
  await expect(page.getByText("No tienes permiso para esta sección")).toBeVisible();
  const r = await page.request.get("/api/v1/usuarios");
  expect(r.status()).toBe(403);
});

test("cerrar sesión revoca el acceso", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
