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
  it("toda ruta API exporta handlers envueltos en conPermiso o publico", () => {
    const rutas = fuente.filter((f) => /^src\/app\/.*\/route\.tsx?$/.test(f));
    expect(rutas.length).toBeGreaterThan(0);
    for (const f of rutas) {
      const t = leer(f);
      expect(t, `${f}: no usar export function`).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+(${METODOS.join("|")})\\b`));
      const exportados = [...t.matchAll(new RegExp(`export\\s+const\\s+(${METODOS.join("|")})\\s*=\\s*(\\w+)`, "g"))];
      expect(exportados.length, `${f}: sin handlers`).toBeGreaterThan(0);
      for (const [, metodo, envoltura] of exportados) {
        expect(["conPermiso", "publico"], `${f} ${metodo}`).toContain(envoltura);
      }
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
