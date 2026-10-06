import { NextRequest } from "next/server";
import { COOKIE_SESION } from "@/domain/auth/politica";

// Invoca route handlers directamente, como lo haría Next, sin levantar el servidor.
type Ruta = (req: NextRequest, s: { params: Promise<never> }) => Promise<Response>;

export interface Peticion { cuerpo?: unknown; token?: string; csrf?: string; ip?: string; cabeceras?: Record<string, string> }

export async function llamar(ruta: Ruta, metodo: string, url: string, p: Peticion = {}, params: object = {}) {
  const cabeceras = new Headers({ "user-agent": "vitest", "x-forwarded-for": p.ip ?? "10.1.1.1", ...p.cabeceras });
  if (p.cuerpo !== undefined) cabeceras.set("content-type", "application/json");
  if (p.token) cabeceras.set("cookie", `${COOKIE_SESION}=${p.token}`);
  if (p.csrf) cabeceras.set("x-csrf-token", p.csrf);
  const req = new NextRequest(new URL(url, "http://localhost"), {
    method: metodo, headers: cabeceras, body: p.cuerpo === undefined ? undefined : JSON.stringify(p.cuerpo),
  });
  const res = await ruta(req, { params: Promise.resolve(params as never) });
  const bytes = Buffer.from(await res.arrayBuffer());
  const json = res.headers.get("content-type")?.includes("json") || !res.headers.get("content-type");
  return { estado: res.status, cuerpo: json && bytes.length ? JSON.parse(bytes.toString()) : null, bytes, res };
}

export function tokenDeCookie(res: Response): string | undefined {
  return res.headers.get("set-cookie")?.match(new RegExp(`${COOKIE_SESION}=([^;]+)`))?.[1];
}
