import { expect, test } from "@playwright/test";
import { api, ingresar, ir } from "./ayudas";
import { bdE2e } from "./bd";
import { ADMIN, CONSULTA } from "./datos";

// Suite 14 (TESTING §3): el registro tiene las acciones de 01–13, incluidas las denegaciones, y es inmutable.
test.describe.configure({ mode: "serial" });

const ESPERADAS = [
  "importar", "crear", "entrada_produccion", "ajuste", "recepcion", "cerrar", "interpretar (encolar)", "quitar ítem",
  "fijar precio a pedido", "aprobar", "descargar pdf", "crear pedido", "reserva", "cancelar pedido", "liberacion", "recalcular", "crear manual",
];

test("cada acción de las suites anteriores quedó registrada", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const bd = bdE2e();
  const { rows } = await bd.query("SELECT DISTINCT accion FROM audit_log");
  await bd.end();
  const acciones = rows.map((r) => r.accion as string);
  for (const a of ESPERADAS) expect(acciones, `falta «${a}»`).toContainEqual(expect.stringContaining(a));
  const d = await api(page, "GET", "/api/v1/auditoria?resultado=denegado&limite=200");
  expect(d.cuerpo.datos.filter((e: { actor: string }) => e.actor === CONSULTA.nombre).length).toBeGreaterThanOrEqual(8);
});

test("filtrar por actor en la pantalla muestra solo sus registros, con los denegados", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  await ir(page, "/administracion/auditoria");
  await page.getByLabel("Actor").selectOption({ label: CONSULTA.nombre });
  await page.getByLabel("Resultado").selectOption("denegado");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/resultado=denegado/);
  const filas = page.getByRole("row").filter({ hasText: "denegado" });
  await expect(filas.first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: ADMIN.nombre })).toHaveCount(0);
});

test("el registro no admite UPDATE ni DELETE", async () => {
  const bd = bdE2e();
  const { rows: [{ n }] } = await bd.query("SELECT count(*)::int AS n FROM audit_log");
  await expect(bd.query("UPDATE audit_log SET resultado = 'ok' WHERE resultado = 'denegado'")).rejects.toThrow();
  await expect(bd.query("DELETE FROM audit_log")).rejects.toThrow();
  const { rows: [{ n: despues }] } = await bd.query("SELECT count(*)::int AS n FROM audit_log");
  await bd.end();
  expect(despues).toBe(n);
});
