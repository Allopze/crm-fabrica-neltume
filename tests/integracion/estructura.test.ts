import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Chequeos estructurales de AGENTS.md y SECURITY §2. Recorren los archivos versionados o por versionar.
const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && existsSync(f));
const fuente = archivos.filter((f) => /\.(ts|tsx|mts|js|mjs)$/.test(f) && !f.startsWith("src/db/migraciones/"));
const leer = (f: string) => readFileSync(f, "utf8");
const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

describe("estructura del código (SECURITY §2, AGENTS.md)", () => {
  it("toda ruta API exporta handlers envueltos en conPermiso o publico (o integracion, solo la de la tienda)", () => {
    const rutas = fuente.filter((f) => /^src\/app\/.*\/route\.tsx?$/.test(f));
    expect(rutas.length).toBeGreaterThan(0);
    for (const f of rutas) {
      const t = leer(f);
      expect(t, `${f}: no usar export function`).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+(${METODOS.join("|")})\\b`));
      const exportados = [...t.matchAll(new RegExp(`export\\s+const\\s+(${METODOS.join("|")})\\s*=\\s*(\\w+)`, "g"))];
      expect(exportados.length, `${f}: sin handlers`).toBeGreaterThan(0);
      // `integracion` (firma HMAC de la tienda, ADR-0023) solo vale bajo src/app/api/integrations/.
      const permitidas = f.startsWith("src/app/api/integrations/") ? ["integracion"] : ["conPermiso", "publico"];
      for (const [, metodo, envoltura] of exportados) {
        expect(permitidas, `${f} ${metodo}`).toContain(envoltura);
      }
    }
  });

  it("la app no sale a internet: solo los servicios con salida (src/ai, src/compras, src/enlace) hacen llamadas de red (SECURITY §6)", () => {
    const app = fuente.filter((f) => /^src\/(domain|app\/api)\//.test(f) && !/\.test\.tsx?$/.test(f));
    expect(app.length).toBeGreaterThan(0);
    for (const f of app) expect(leer(f), f).not.toMatch(/\bfetch\s*\(|from "node:(https?|net|dns|tls)"|from "undici"/);
  });

  it("el servicio de enlace nunca usa el secreto de la integración ni firma nada: reenvía lo que la app firmó (ADR-0024 §3)", () => {
    const enlace = fuente.filter((f) => f.startsWith("src/enlace/") && !/\.test\.tsx?$/.test(f));
    expect(enlace.length).toBeGreaterThan(0);
    for (const f of enlace) {
      for (const prohibido of [/INTEGRACION_TIENDA_SECRETO/, /configIntegracion|configEnvio/, /\bfirmar\s*\(/, /\bfirmaHmac\b/, /armarPruebaSaliente/]) {
        expect(leer(f), `${f} ↔ ${prohibido}`).not.toMatch(prohibido);
      }
    }
  });

  it("un handler OPTIONS o HEAD sin envoltura solo puede responder 405 (no toca datos ni se salta la autorización)", () => {
    const rutas = fuente.filter((f) => /^src\/app\/.*\/route\.tsx?$/.test(f));
    for (const f of rutas) {
      const t = leer(f);
      if (/export\s+(const|async\s+function|function)\s+(OPTIONS|HEAD)\b/.test(t)) expect(t, `${f}: OPTIONS/HEAD`).toMatch(/status:\s*405/);
    }
  });

  it("no hay rutas de webhooks (ADR-0003)", () => {
    expect(archivos.filter((f) => /\/webhooks?\//i.test(f))).toEqual([]);
  });

  it("no hay Server Actions: las mutaciones van por route handlers", () => {
    for (const f of fuente.filter((x) => x.startsWith("src/"))) {
      expect(leer(f), f).not.toMatch(/^\s*["']use server["']/m);
    }
  });

  it("ningún archivo fuente supera 500 líneas", () => {
    const largos = fuente.map((f) => [f, leer(f).split("\n").length] as const).filter(([, n]) => n > 500);
    expect(largos).toEqual([]);
  });

  it("no hay secretos en archivos versionables", () => {
    const patrones = [
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\bsk-[A-Za-z0-9_-]{20,}/,
      /\bAKIA[0-9A-Z]{16}\b/,
      /\bgh[pousr]_[A-Za-z0-9]{30,}/,
      /postgres(ql)?:\/\/[^\s:@/]+:(?!<|\$\{)[^\s@]{6,}@/,
      /\beyJ[A-Za-z0-9_-]{60,}/,
    ];
    const revisables = archivos.filter((f) => !/(^|\/)package-lock\.json$|\.(png|jpe?g|ico|xlsx|woff2?)$/.test(f));
    const hallazgos = revisables.flatMap((f) => patrones.filter((p) => p.test(leer(f))).map((p) => `${f} ↔ ${p}`));
    expect(hallazgos).toEqual([]);
  });

  it(".env.local y datos/ no se versionan", () => {
    expect(archivos.some((f) => f === ".env.local" || f.startsWith("datos/"))).toBe(false);
  });
});
