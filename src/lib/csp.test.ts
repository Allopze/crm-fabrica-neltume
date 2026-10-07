import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import { politicaCsp } from "./csp";

describe("Content-Security-Policy (auditoría M-01)", () => {
  it("scripts solo propios o con el nonce; sin eval en producción; sin marcos ni objetos", () => {
    const csp = politicaCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp.split("; ").find((d) => d.startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(politicaCsp("abc", true)).toContain("'unsafe-eval'");
  });

  it("el proxy pone la política con un nonce nuevo en cada petición y se lo pasa a Next", () => {
    const a = proxy(new NextRequest("http://localhost/login"));
    const b = proxy(new NextRequest("http://localhost/login"));
    const nonce = (r: Response) => r.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce(a));
  });

  it("no se aplica a la API ni a los estáticos", () => {
    const fuente = new RegExp(`^${config.matcher[0].source}$`);
    expect(fuente.test("/login")).toBe(true);
    expect(fuente.test("/cotizaciones/123")).toBe(true);
    expect(fuente.test("/api/v1/sesion")).toBe(false);
    expect(fuente.test("/_next/static/chunk.js")).toBe(false);
  });
});
