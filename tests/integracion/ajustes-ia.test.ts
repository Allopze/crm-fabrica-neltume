import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAjustesIA from "@/app/api/v1/ajustes/ia/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { crearInterpreteDesdeAjustes } from "@/ai/index";
import { escribirCatalogo } from "@/ai/ajustes";
import { bd, cerrarBd } from "@/db/conexion";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const SISTEMA = { tipo: "sistema" as const };
const cmdKeyOriginal = process.env.CMD_API_KEY;
const groqKeyOriginal = process.env.GROQ_API_KEY;
let admin: { token: string; csrf: string };
let sinPermiso: { token: string; csrf: string };

async function login(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf as string };
}

beforeAll(async () => {
  process.env.CMD_API_KEY = "commandcode-clave-integracion";
  process.env.GROQ_API_KEY = "groq-clave-integracion";
  await escribirCatalogo("commandcode", { actualizadoEn: new Date().toISOString(), fuente: "prueba oficial", modelos: [
    { id: "gpt-6-luna", nombre: "GPT-6 Luna", compatible: true, preview: false, precioEntradaUsdMTok: 1.5, precioSalidaUsdMTok: 9 },
    { id: "Qwen/Qwen3.7-Flash", nombre: "Qwen 3.7 Flash", compatible: true, preview: false, precioEntradaUsdMTok: 0.03, precioSalidaUsdMTok: 0.13 },
  ] });
  await escribirCatalogo("groq", { actualizadoEn: new Date().toISOString(), fuente: "prueba oficial", modelos: [
    { id: "openai/gpt-oss-120b", nombre: "GPT OSS 120B", compatible: true, preview: false, limites: { rpm: "30", rpd: "1K", tpm: "8K", tpd: "200K" } },
    { id: "meta-llama/model-preview", nombre: "Preview", compatible: false, preview: true, motivo: "Preview no se activa" },
  ] });
  await bd().transaction((tx) => crearUsuario(tx, { email: "ajustes-ia@neltume.cl", nombre: "IA admin", clave: "clave-ajustes-ia" }, SISTEMA, "consola"));
  const rol = await bd().transaction((tx) => crearRol(tx, "sin ajustes ia", ["stock.ver"], SISTEMA, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: "solo-lectura-ia@neltume.cl", nombre: "Solo lectura", clave: "clave-solo-ia", rolId: rol.id }, SISTEMA, "consola"));
  admin = await login("ajustes-ia@neltume.cl", "clave-ajustes-ia", "10.44.0.1");
  sinPermiso = await login("solo-lectura-ia@neltume.cl", "clave-solo-ia", "10.44.0.2");
});
afterAll(async () => {
  if (cmdKeyOriginal === undefined) delete process.env.CMD_API_KEY; else process.env.CMD_API_KEY = cmdKeyOriginal;
  if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = groqKeyOriginal;
  await app.end(); await cerrarBd();
});

describe("Ajustes de IA (REQ-ADM-4.1–4.3)", () => {
  it("exige sesión y config.editar en GET/PUT y audita las denegaciones", async () => {
    const noSesion = await llamar(rutaAjustesIA.GET, "GET", "/api/v1/ajustes/ia");
    expect(noSesion.estado).toBe(401);
    const noSesionPut = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", { cuerpo: { groqZdrConfirmado: false } });
    expect(noSesionPut.estado).toBe(401);
    const noPermiso = await llamar(rutaAjustesIA.GET, "GET", "/api/v1/ajustes/ia", sinPermiso);
    expect(noPermiso.estado).toBe(403);
    const noPermisoPut = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", { ...sinPermiso, cuerpo: { groqZdrConfirmado: false } });
    expect(noPermisoPut.estado).toBe(403);
    const { rows } = await app.query("SELECT resultado, despues->>'motivo' AS motivo FROM audit_log WHERE accion IN ('GET /api/v1/ajustes/ia', 'PUT /api/v1/ajustes/ia') AND resultado = 'denegado'");
    expect(rows).toHaveLength(4);
  });

  it("GET devuelve catálogos y tarifas/límites sin informar ni revelar credenciales del worker", async () => {
    const r = await llamar(rutaAjustesIA.GET, "GET", "/api/v1/ajustes/ia", admin);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.catalogos.commandcode.modelos[0]).toMatchObject({ precioEntradaUsdMTok: 1.5, precioSalidaUsdMTok: 9 });
    expect(r.cuerpo.catalogos.commandcode.modelos[0]).toMatchObject({ modoRazonamiento: "Esfuerzo mínimo (low)" });
    expect(r.cuerpo.catalogos.commandcode.modelos[1]).toMatchObject({ compatible: true, modoRazonamiento: "Esfuerzo predeterminado del proveedor" });
    expect(r.cuerpo.catalogos.groq.modelos[0].limites).toEqual({ rpm: "30", rpd: "1K", tpm: "8K", tpd: "200K" });
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/keyCipher|"sobre"|Cipher/i);
    expect(r.cuerpo).not.toHaveProperty("clavePublica");
    expect(r.cuerpo).not.toHaveProperty("claves");
  });

  it("requiere confirmar ZDR para Groq, audita solo configuración y selecciona el próximo intérprete", async () => {
    const claveEnCuerpo = "api-key-no-se-acepta-en-http";
    const rechazaClave = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { groqZdrConfirmado: true, groqKeyCipher: claveEnCuerpo },
    });
    expect(rechazaClave.estado).toBe(400);
    expect(JSON.stringify(rechazaClave.cuerpo)).not.toContain(claveEnCuerpo);

    const faltaZdr = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "groq", modelo: "openai/gpt-oss-120b", groqZdrConfirmado: false },
    });
    expect(faltaZdr.estado).toBe(400);
    expect(faltaZdr.cuerpo.error.mensaje).toMatch(/Zero Data Retention/);

    const activar = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "groq", modelo: "openai/gpt-oss-120b", groqZdrConfirmado: true },
    });
    expect(activar.estado).toBe(200);
    const siguienteTrabajo = await crearInterpreteDesdeAjustes();
    expect(siguienteTrabajo).toMatchObject({ nombre: "groq" });

    const vista = await llamar(rutaAjustesIA.GET, "GET", "/api/v1/ajustes/ia", admin);
    expect(vista.cuerpo).toMatchObject({ proveedor: "groq", modelo: "openai/gpt-oss-120b" });
    expect(JSON.stringify(vista.cuerpo)).not.toContain("groq-clave-integracion");
    expect(JSON.stringify(vista.cuerpo)).not.toContain("commandcode-clave-integracion");
    const { rows } = await app.query("SELECT antes, despues FROM audit_log WHERE accion = 'actualizar ajustes de IA' AND recurso = 'configuracion' ORDER BY id");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows)).not.toContain("groq-clave-integracion");
    expect(JSON.stringify(rows)).not.toContain(claveEnCuerpo);
    expect(rows.at(-1).despues).toMatchObject({ proveedor: "groq", modelo: "openai/gpt-oss-120b" });

    const activarCommandCode = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "commandcode", modelo: "gpt-6-luna", groqZdrConfirmado: true },
    });
    expect(activarCommandCode.estado).toBe(200);
    expect(await crearInterpreteDesdeAjustes()).toMatchObject({ nombre: "commandcode" });

    const qwenSinEffort = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "commandcode", modelo: "Qwen/Qwen3.7-Flash", groqZdrConfirmado: true },
    });
    expect(qwenSinEffort.estado).toBe(200);
    expect(await crearInterpreteDesdeAjustes()).toMatchObject({ nombre: "commandcode" });

    const noExiste = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "groq", modelo: "modelo-inexistente", groqZdrConfirmado: true },
    });
    expect(noExiste.estado).toBe(400);
    const preview = await llamar(rutaAjustesIA.PUT, "PUT", "/api/v1/ajustes/ia", {
      ...admin, cuerpo: { proveedorActivo: "groq", modelo: "meta-llama/model-preview", groqZdrConfirmado: true },
    });
    expect(preview.estado).toBe(400);
  });
});
