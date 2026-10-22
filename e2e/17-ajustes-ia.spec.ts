import { expect, test } from "@playwright/test";
import { api, elegirDropdown, ingresar } from "./ayudas";
import { bdE2e } from "./bd";
import { ADMIN } from "./datos";

// Suite 17 (TESTING §3; ADR-0009, ADR-0022): el modelo de Command Code se elige en Ajustes y el worker lo usa con la
// clave de su entorno, contra un Command Code simulado local (e2e/ia-mock.mts).
test.describe.configure({ mode: "serial" });

test("Ajustes elige el modelo desde la UI y el worker usa la clave de entorno", async ({ page }) => {
  const db = bdE2e();
  const catalogo = {
    actualizadoEn: new Date().toISOString(), fuente: "https://commandcode.ai/docs/resources/pricing-limits",
    modelos: [
      { id: "gpt-6-luna", nombre: "GPT-6 Luna", compatible: true, preview: false, precioEntradaUsdMTok: 1.5, precioSalidaUsdMTok: 9 },
      { id: "modelo-preview", nombre: "Modelo Preview", compatible: false, preview: true, motivo: "Modelo Preview: no se activa en cotizaciones." },
    ],
  };
  await db.query("INSERT INTO parametro (clave, valor) VALUES ('ia.catalogo.commandcode', $1::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [JSON.stringify(catalogo)]);

  try {
    await ingresar(page, ADMIN.email, ADMIN.clave);
    await page.goto("/administracion/ia");
    await expect(page.getByRole("heading", { name: "Ajustes de IA" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Command Code");
    await expect(page.getByText("CMD_API_KEY=")).toHaveCount(0);
    await expect(page.getByText(/groq/i)).toHaveCount(0);
    await expect(page.getByText("No hay un modelo activo")).toBeVisible();

    // El selector se opera con el teclado y se cierra con Esc (REQ-NFR-6).
    const modelo = page.getByRole("combobox", { name: "Modelo" });
    await modelo.focus();
    await modelo.press("ArrowDown");
    await expect(modelo).toHaveAttribute("aria-expanded", "true");
    await modelo.press("Escape");
    await expect(modelo).toHaveAttribute("aria-expanded", "false");
    await elegirDropdown(modelo, "gpt-6-luna");
    await page.getByRole("button", { name: "Activar modelo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Configuración activa" })).toBeVisible();

    const estado = await page.request.get("/api/v1/ajustes/ia").then((r) => r.json());
    expect(estado).toMatchObject({ proveedor: "commandcode", modelo: "gpt-6-luna" });
    expect(estado).not.toHaveProperty("claves");
    expect(JSON.stringify(estado)).not.toContain("cmd-e2e-key-simulada-no-real");

    const creada = await api(page, "POST", "/api/v1/cotizaciones/interpretaciones", { texto: "1 puerta Neltume raulí 90x210" });
    expect(creada.estado).toBe(202);
    const limite = Date.now() + 20_000;
    let llamada: { proveedor: string; modelo: string; resultado: string; costo: string | null } | undefined;
    while (!llamada && Date.now() < limite) {
      const { rows } = await db.query(`SELECT l.proveedor, l.modelo, l.resultado, l.costo_usd::text AS costo
        FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1`, [creada.cuerpo.id]);
      llamada = rows.find((fila) => fila.resultado === "ok");
      if (!llamada) await new Promise((ok) => setTimeout(ok, 250));
    }
    expect(llamada).toMatchObject({ proveedor: "commandcode", modelo: "gpt-6-luna", resultado: "ok" });
    // El costo sale de la tarifa publicada del catálogo: 20 tokens de entrada y 10 de salida.
    expect(Number(llamada?.costo)).toBeCloseTo((20 * 1.5 + 10 * 9) / 1_000_000, 10);
  } finally {
    await db.end();
  }
});
