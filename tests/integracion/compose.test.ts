import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Servicio = { ports?: string[]; networks?: string[]; environment?: Record<string, string> };
const compose = parse(readFileSync("docker-compose.yml", "utf8")) as {
  services: Record<string, Servicio>;
  networks: Record<string, { internal?: boolean }>;
};

describe("docker-compose.yml de producción (SECURITY §6, T8)", () => {
  it("ningún servicio publica puertos", () => {
    for (const [nombre, s] of Object.entries(compose.services)) {
      expect(s.ports ?? [], `servicio ${nombre}`).toEqual([]);
    }
  });

  it("db y app solo están en redes internas", () => {
    expect(compose.networks.datos.internal).toBe(true);
    expect(compose.networks.backend.internal).toBe(true);
    expect(compose.services.db.networks).toEqual(["datos"]);
    expect(compose.services.app.networks?.every((n) => compose.networks[n].internal)).toBe(true);
  });

  it("las API keys de proveedores solo llegan al worker", () => {
    for (const [nombre, s] of Object.entries(compose.services)) {
      if (nombre !== "worker") expect(Object.keys(s.environment ?? {})).not.toContain("CMD_API_KEY");
      // Groq se retiró (ADR-0022): ningún servicio recibe sus variables.
      expect(Object.keys(s.environment ?? {}).filter((k) => k.startsWith("GROQ_"))).toEqual([]);
      // No queda ninguna clave de cifrado de una versión anterior (ADR-0009): las claves no se guardan en la BD.
      expect(Object.keys(s.environment ?? {}).filter((k) => k.startsWith("IA_CONFIG_"))).toEqual([]);
    }
    expect(compose.services.worker.environment).toHaveProperty("CMD_API_KEY");
  });

  it("las credenciales de Chipax solo llegan al servicio de compras, que no está en la red de la app (ADR-0021)", () => {
    for (const [nombre, s] of Object.entries(compose.services)) {
      if (nombre === "compras") continue;
      expect(Object.keys(s.environment ?? {}).filter((k) => k.startsWith("CHIPAX_")), `servicio ${nombre}`).toEqual([]);
    }
    expect(compose.services.compras.environment).toHaveProperty("CHIPAX_APP_ID");
    expect(compose.services.compras.environment).toHaveProperty("CHIPAX_SECRET_KEY");
    expect(compose.services.compras.networks).toEqual(["datos", "salida"]);
  });

  it("el secreto de la API de la tienda solo llega a la app (ADR-0023 §9)", () => {
    for (const [nombre, s] of Object.entries(compose.services as Record<string, Servicio>)) {
      if (nombre !== "app") expect(Object.keys(s.environment ?? {}).filter((k) => k.startsWith("INTEGRACION_TIENDA_")), `servicio ${nombre}`).toEqual([]);
    }
    expect(compose.services.app.environment).toHaveProperty("INTEGRACION_TIENDA_SECRETO");
    expect(compose.services.app.environment).toHaveProperty("INTEGRACION_TIENDA_CLIENTE_RUT");
  });

  it("el servicio de enlace con la tienda solo sale a internet, con su rol y su URL, y nunca con el secreto de la integración (ADR-0024)", () => {
    const enlace = compose.services.enlace as Servicio & { profiles?: string[] };
    expect(enlace.profiles).toEqual(["tienda"]);
    expect(enlace.networks).toEqual(["datos", "salida"]); // sin `backend`: nadie le llega, solo sale
    expect(Object.keys(enlace.environment ?? {}).sort()).toEqual(["DATABASE_URL_ENLACE", "ENLACE_TIENDA_TIMEOUT_MS", "ENLACE_TIENDA_URL"]);
    for (const [nombre, s] of Object.entries(compose.services)) {
      if (nombre !== "enlace") expect(Object.keys(s.environment ?? {}).filter((k) => k.startsWith("ENLACE_")), `servicio ${nombre}`).toEqual([]);
    }
    // `migrar` crea su rol de BD; la app firma con su secreto y no necesita la URL de la tienda (no sale a internet).
    expect(compose.services.migrar.environment).toHaveProperty("DATABASE_URL_ENLACE");
    expect(compose.services.app.environment).not.toHaveProperty("ENLACE_TIENDA_URL");
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/^FROM herramientas AS enlace$/m);
    const ejemplo = readFileSync(".env.example", "utf8");
    for (const v of ["ENLACE_TIENDA_URL", "ENLACE_TIENDA_TIMEOUT_MS", "DATABASE_URL_ENLACE"]) expect(ejemplo, v).toMatch(new RegExp(`^${v}=$`, "m"));
  });

  it("solo el worker, compras y enlace usan la red con salida a internet: la app no (SECURITY §6)", () => {
    const enSalida = Object.entries(compose.services).filter(([, s]) => s.networks?.includes("salida")).map(([n]) => n).sort();
    expect(enSalida).toEqual(["compras", "enlace", "worker"]);
    expect(compose.networks.salida.internal).toBeFalsy();
  });

  it("la app recibe los datos de la empresa que imprimen los PDF", () => {
    const ejemplo = readFileSync(".env.example", "utf8").match(/^NELTUME_EMPRESA_[A-Z]+(?==)/gm) ?? [];
    expect(ejemplo.length).toBeGreaterThan(0);
    for (const v of ejemplo) expect(compose.services.app.environment, v).toHaveProperty(v);
  });

  it("el túnel llega solo a la app, sin proxy intermedio (ADR-0011)", () => {
    expect(compose.services.proxy).toBeUndefined();
    expect(compose.services.tunnel.networks).toEqual(["borde", "backend"]);
    const enBackend = Object.entries(compose.services).filter(([, s]) => s.networks?.includes("backend")).map(([n]) => n).sort();
    expect(enBackend).toEqual(["app", "tunnel"]);
  });

  it(".env.example tiene nombres sin valores", () => {
    const lineas = readFileSync(".env.example", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    expect(lineas.length).toBeGreaterThan(5);
    for (const l of lineas) expect(l, l).toMatch(/^[A-Z_]+=$/);
  });

  it("el acceso administrativo a la BD solo se enlaza a 127.0.0.1", () => {
    const admin = parse(readFileSync("docker-compose.admin.yml", "utf8")) as { services: Record<string, Servicio> };
    for (const s of Object.values(admin.services)) {
      for (const p of s.ports ?? []) expect(p).toMatch(/^127\.0\.0\.1:/);
    }
  });

  it("el respaldo tiene healthcheck: sin respaldo verificado en 26 h queda unhealthy (H-01, REQ-NFR-4)", () => {
    const backup = compose.services.backup as Servicio & { healthcheck?: { test: string[] } };
    expect(backup.healthcheck?.test.join(" ")).toContain("/backups/ultimo-ok -mmin -1560");
  });

  it("toda imagen externa está fijada por digest (auditoría H-16, DESIGN §4)", () => {
    const imagenes = Object.values(compose.services).map((x) => (x as Servicio & { image?: string }).image).filter(Boolean) as string[];
    expect(imagenes.length).toBeGreaterThan(0);
    for (const i of imagenes) expect(i, i).toMatch(/@sha256:[0-9a-f]{64}$/);
    const bases = readFileSync("Dockerfile", "utf8").match(/^FROM\s+\S+/gm)!.map((l) => l.split(/\s+/)[1]).filter((b) => b.includes(":"));
    expect(bases.length).toBeGreaterThan(0);
    for (const b of bases) expect(b, b).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it("el contexto de Docker excluye respaldos, referencia, Excel y secretos (H-11, AGENTS regla 10)", () => {
    const ignorados = readFileSync(".dockerignore", "utf8").split("\n").map((l) => l.trim());
    for (const e of ["respaldos-externos", "referencia", "/*.xlsx", "docs/plantillas/*.xlsx", "datos", ".env", ".env.*", ".claude"]) {
      expect(ignorados, e).toContain(e);
    }
  });
});
