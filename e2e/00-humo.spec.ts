import { expect, test } from "@playwright/test";

test("la pantalla de ingreso carga en español", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es-CL");
});
