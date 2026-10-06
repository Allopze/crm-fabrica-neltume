import { expect, test } from "@playwright/test";
import { api, ingresar } from "./ayudas";
import { bdE2e } from "./bd";
import { ADMIN } from "./datos";

test.describe.configure({ mode: "serial" });

test("Ajustes elige proveedor/modelo desde la UI y el worker usa la clave de entorno", async ({ page }) => {
  const db = bdE2e();
  const catalogo = {
    actualizadoEn: new Date().toISOString(), fuente: "https://console.groq.com/docs/rate-limits",
    modelos: [{ id: "openai/gpt-oss-120b", nombre: "GPT OSS 120B", compatible: true, preview: false, limites: { rpm: "30", rpd: "1K", tpm: "8K", tpd: "200K" } }],
  };
  await db.query("INSERT INTO parametro (clave, valor) VALUES ('ia.catalogo.groq', $1::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [JSON.stringify(catalogo)]);

  try {
    await ingresar(page, ADMIN.email, ADMIN.clave);
    await page.goto("/administracion/ia");
    await expect(page.getByRole("heading", { name: "Ajustes de IA" })).toBeVisible();
    await expect(page.getByText("GROQ_API_KEY=")).toBeVisible();
    await expect(page.getByLabel("API key de Groq")).toHaveCount(0);

    await page.getByLabel("Proveedor").selectOption("groq");
    await page.getByLabel("Modelo").selectOption("openai/gpt-oss-120b");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Activar proveedor y modelo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Configuración activa" })).toBeVisible();

    const estado = await page.request.get("/api/v1/ajustes/ia").then((r) => r.json());
    expect(estado).toMatchObject({ proveedor: "groq", modelo: "openai/gpt-oss-120b" });
    expect(estado).not.toHaveProperty("claves");

    const creada = await api(page, "POST", "/api/v1/cotizaciones/interpretaciones", { texto: "1 puerta Neltume raulí 90x210" });
    expect(creada.estado).toBe(202);
    const limite = Date.now() + 20_000;
    let llamada: { proveedor: string; modelo: string; resultado: string } | undefined;
    while (!llamada && Date.now() < limite) {
      const { rows } = await db.query(`SELECT l.proveedor, l.modelo, l.resultado
        FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1`, [creada.cuerpo.id]);
      llamada = rows.find((fila) => fila.resultado === "ok");
      if (!llamada) await new Promise((ok) => setTimeout(ok, 250));
    }
    expect(llamada).toMatchObject({ proveedor: "groq", modelo: "openai/gpt-oss-120b", resultado: "ok" });
  } finally {
    await db.end();
  }
});
