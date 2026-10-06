import { afterAll, describe, expect, it } from "vitest";
import "./bd";
import { llamar } from "./http";
import nextConfig, { ENCABEZADOS_SEGURIDAD } from "../../next.config";
import * as rutaImportar from "@/app/api/v1/importaciones/route";
import * as rutaNota from "@/app/api/v1/pedidos/nota-tienda/vista-previa/route";
import * as rutaSalud from "@/app/api/v1/salud/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { cerrarBd } from "@/db/conexion";

afterAll(() => cerrarBd());

describe("salud, encabezados y tamaño del cuerpo (DESIGN §5, SECURITY §2, ADR-0011)", () => {
  it("GET /api/v1/salud responde ok sin sesión y sin datos internos", async () => {
    const r = await llamar(rutaSalud.GET, "GET", "/api/v1/salud");
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ estado: "ok" });
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });

  it("los encabezados de seguridad salen de next.config, en toda ruta (ADR-0011)", async () => {
    const reglas = await nextConfig.headers!();
    expect(reglas).toEqual([{ source: "/:path*", headers: ENCABEZADOS_SEGURIDAD }]);
    const h = Object.fromEntries(ENCABEZADOS_SEGURIDAD.map((e) => [e.key, e.value]));
    expect(h).toMatchObject({ "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Strict-Transport-Security": expect.stringContaining("max-age=") });
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("un cuerpo grande se rechaza antes de leerlo: 1 MB por defecto, 6 MB en las cargas de archivos (ADR-0011)", async () => {
    const grande = { "content-length": String(2 * 1024 * 1024) };
    expect((await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: {}, cabeceras: grande })).cuerpo.error.codigo).toBe("CUERPO_GRANDE");
    // Sin Content-Length (por trozos, como puede reenviar cloudflared): se lee contando bytes y se corta al pasar el máximo.
    const enorme = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "x".repeat(1100 * 1024), clave: "y" } });
    expect(enorme.estado).toBe(413);
    // Uno chico llega entero al handler (aquí, credenciales inválidas).
    const chico = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "nadie@neltume.cl", clave: "incorrecta" }, ip: "10.9.9.9" });
    expect(chico.cuerpo.error.codigo).toBe("CREDENCIALES");
    // Una ruta de archivos acepta hasta 6 MB (sin sesión sigue con 401) y rechaza más (413 antes de mirar la sesión).
    expect((await llamar(rutaImportar.POST, "POST", "/api/v1/importaciones", { cabeceras: { "content-length": String(5.5 * 1024 * 1024) } })).estado).toBe(401);
    expect((await llamar(rutaImportar.POST, "POST", "/api/v1/importaciones", { cabeceras: { "content-length": String(7 * 1024 * 1024) } })).estado).toBe(413);
    expect((await llamar(rutaNota.POST, "POST", "/api/v1/pedidos/nota-tienda/vista-previa", { cabeceras: { "content-length": String(5.5 * 1024 * 1024) } })).estado).toBe(401);
  });
});
