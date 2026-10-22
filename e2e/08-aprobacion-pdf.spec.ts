import { expect, test } from "@playwright/test";
import { api, cotizacionId, ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 08 (TESTING §3): aprobar congela precios, fija vigencia y aprobador, y habilita el PDF.
test.describe.configure({ mode: "serial" });

const clp = (n: number) => `$${new Intl.NumberFormat("es-CL").format(n)}`;

test("aprobar A congela precios, fija la vigencia y muestra al aprobador", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await cotizacionId(page, "estado=borrador&q=Alerces");
  await ir(page, `/cotizaciones/${id}`);
  await page.getByRole("button", { name: "Aprobar cotización" }).click();
  await page.getByRole("button", { name: "Confirmar aprobación" }).click();
  const banner = page.getByRole("status").filter({ hasText: "Aprobada por" });
  await expect(banner).toContainText(`Aprobada por ${ADMIN.nombre}`);
  await expect(banner).toContainText(/vigente hasta el \d{2}-\d{2}-\d{4}/);
  await expect(page.getByRole("button", { name: /Quitar/ })).toHaveCount(0);

  const c = (await api(page, "GET", `/api/v1/cotizaciones/${id}`)).cuerpo;
  expect(c).toMatchObject({ estado: "aprobada", aprobador: ADMIN.nombre });
  // 10 días hábiles desde hoy: nunca menos de 14 días corridos.
  expect((new Date(c.vigenciaHasta).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(12);
  await expect(page.getByRole("main")).toContainText(clp(Number(c.total)));
  const r = await api(page, "PATCH", `/api/v1/cotizaciones/${id}/items/${c.items[0].id}`, { cantidad: 9, version: c.version });
  expect(r.cuerpo.error.codigo).toBe("NO_EDITABLE");
});

test("el PDF de A se descarga; un borrador no tiene PDF", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.clave);
  const id = await cotizacionId(page, "estado=aprobada&q=Alerces");
  await ir(page, `/cotizaciones/${id}`);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "PDF" }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^Neltume - Cotización N\.º \d+\.pdf$/);
  const pdf = await api(page, "GET", `/api/v1/cotizaciones/${id}/pdf`);
  expect(pdf.res.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const borrador = await cotizacionId(page, "estado=borrador");
  const r = await api(page, "GET", `/api/v1/cotizaciones/${borrador}/pdf`);
  expect(r.estado).toBe(409);
  expect(r.cuerpo.error.codigo).toBe("NO_APROBADA");
});
