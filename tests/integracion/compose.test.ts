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

  it("la clave del LLM solo llega al worker", () => {
    for (const [nombre, s] of Object.entries(compose.services)) {
      if (nombre !== "worker") expect(Object.keys(s.environment ?? {})).not.toContain("CMD_API_KEY");
    }
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
});
