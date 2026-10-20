import { expect, type Browser, type Locator, test } from "@playwright/test";
import { ingresar, ir } from "./ayudas";
import { ADMIN } from "./datos";

// Suite 20 (TESTING §3; NFR-6): el recorrido completo en un celular (390×844, con el dedo) no debe tener scroll
// horizontal de página y los controles principales deben medir al menos 44 px de alto.
test.describe.configure({ mode: "serial" });

const RUTAS = ["/", "/cotizaciones", "/pedidos", "/stock", "/materias-primas", "/precios", "/produccion", "/clientes"];

/** Contexto de celular que hereda del proyecto la URL base, el idioma y la zona horaria (playwright.config.ts). */
async function abrirCelular(browser: Browser) {
  const { baseURL, locale, timezoneId } = test.info().project.use;
  const contexto = await browser.newContext({
    baseURL,
    locale,
    timezoneId,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  await ingresar(page, ADMIN.email, ADMIN.clave);
  return { contexto, page };
}

/** Alto real del control (en píxeles CSS), medido con la caja que devuelve `boundingBox()`. */
async function alto(localizador: Locator, descripcion: string): Promise<number> {
  await expect(localizador, `${descripcion} debe ser visible`).toBeVisible();
  const caja = await localizador.boundingBox();
  expect(caja, `${descripcion} debe tener caja`).not.toBeNull();
  return caja?.height ?? 0;
}

test("ninguna pantalla hace scroll horizontal en un celular", async ({ browser }) => {
  const { contexto, page } = await abrirCelular(browser);
  try {
    for (const ruta of RUTAS) {
      await ir(page, ruta);
      const ancho = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        visible: document.documentElement.clientWidth,
      }));
      expect(ancho.scroll, `${ruta} desborda el ancho de la pantalla (${ancho.scroll} > ${ancho.visible})`).toBeLessThanOrEqual(ancho.visible + 1);
    }
  } finally {
    await contexto.close();
  }
});

test("los controles principales miden al menos 44 px de alto con el dedo", async ({ browser }) => {
  const { contexto, page } = await abrirCelular(browser);
  try {
    // Con puntero fino (mouse) el sitio no aplica las variantes pointer-coarse, así que el chequeo queda omitido.
    const grueso = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
    test.skip(!grueso, "El contexto emulado no reporta puntero grueso (pointer: coarse)");

    await ir(page, "/");
    const nueva = page.getByRole("link", { name: "Nueva cotización" }).first();
    expect(await alto(nueva, "«Nueva cotización»"), "«Nueva cotización» debe medir al menos 44 px de alto").toBeGreaterThanOrEqual(44);

    await ir(page, "/stock");
    const filtrar = page.getByRole("button", { name: "Filtrar" });
    expect(await alto(filtrar, "«Filtrar» de /stock"), "«Filtrar» de /stock debe medir al menos 44 px de alto").toBeGreaterThanOrEqual(44);
  } finally {
    await contexto.close();
  }
});
