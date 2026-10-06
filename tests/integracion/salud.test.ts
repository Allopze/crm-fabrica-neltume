import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import "./bd";
import { llamar } from "./http";
import * as rutaSalud from "@/app/api/v1/salud/route";
import { cerrarBd } from "@/db/conexion";

afterAll(() => cerrarBd());

describe("salud y proxy (DESIGN §5, SECURITY §6)", () => {
  it("GET /api/v1/salud responde ok sin sesión y sin datos internos", async () => {
    const r = await llamar(rutaSalud.GET, "GET", "/api/v1/salud");
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ estado: "ok" });
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });

  it("el Caddyfile apaga la API de administración, limita el cuerpo y agrega encabezados", () => {
    const c = readFileSync("Caddyfile", "utf8");
    expect(c).toMatch(/^\s*admin off$/m);
    expect(c).toMatch(/max_size 1MB/);
    expect(c).toMatch(/X-Frame-Options "DENY"/);
    expect(c).toMatch(/reverse_proxy app:3000/);
    expect(c).not.toMatch(/reverse_proxy (?!app:3000)/);
  });
});
