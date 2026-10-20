import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaRolPermisos from "@/app/api/v1/roles/[id]/permisos/route";
import * as rutaRoles from "@/app/api/v1/roles/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import * as rutaUsuario from "@/app/api/v1/usuarios/[id]/route";
import * as rutaUsuarios from "@/app/api/v1/usuarios/route";
import { bd, cerrarBd } from "@/db/conexion";
import { CODIGOS_PERMISO } from "@/domain/auth/permisos";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
const CLAVE = "clave-larga-usuarios";
let admin: { token: string; csrf: string; id: string };
let rolAdminId: string;
let otrosActivos: string[] = [];

async function entrar(email: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: CLAVE }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf as string, id: r.cuerpo.usuario?.id as string };
}

beforeAll(async () => {
  // La BD de integración es compartida: dejamos solo a este admin activo y restauramos al final.
  otrosActivos = (await owner.query("UPDATE usuario SET activo = false WHERE activo RETURNING id")).rows.map((r) => r.id);
  await bd().transaction((tx) => crearUsuario(tx, { email: "jefa@neltume.cl", nombre: "Jefa", clave: CLAVE }, { tipo: "sistema" }, "consola"));
  admin = await entrar("jefa@neltume.cl", "10.4.0.1");
  rolAdminId = (await app.query("SELECT id FROM rol WHERE nombre = 'administrador'")).rows[0].id;
});
afterAll(async () => {
  if (otrosActivos.length) await owner.query("UPDATE usuario SET activo = true WHERE id = ANY($1)", [otrosActivos]);
  await app.end(); await owner.end(); await cerrarBd();
});

describe("usuarios y roles (REQ-ADM-2.1–2.4)", () => {
  it("crea un usuario y lo lista, sin exponer el hash", async () => {
    const r = await llamar(rutaUsuarios.POST, "POST", "/api/v1/usuarios", { ...admin, cuerpo: { email: "Bodega@Neltume.cl", nombre: "Bodega", clave: CLAVE, rolId: rolAdminId } });
    expect(r.estado).toBe(201);
    const lista = await llamar(rutaUsuarios.GET, "GET", "/api/v1/usuarios", admin);
    expect(lista.cuerpo.datos.map((u: { email: string }) => u.email)).toContain("bodega@neltume.cl");
    expect(JSON.stringify(lista.cuerpo)).not.toMatch(/argon2|hash/i);
  });

  it("no permite desactivar al último usuario que puede gestionar usuarios", async () => {
    const bodega = (await app.query("SELECT id FROM usuario WHERE email = 'bodega@neltume.cl'")).rows[0].id;
    expect((await llamar(rutaUsuario.PATCH, "PATCH", "/x", { ...admin, cuerpo: { activo: false } }, { id: bodega })).estado).toBe(200);
    const r = await llamar(rutaUsuario.PATCH, "PATCH", "/x", { ...admin, cuerpo: { activo: false } }, { id: admin.id });
    expect(r.estado).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("ULTIMO_ADMIN");
    const audit = await app.query("SELECT resultado, despues FROM audit_log WHERE correlacion_id = $1", [r.cuerpo.error.correlacion_id]);
    expect(audit.rows[0]).toEqual({ resultado: "error", despues: { codigo: "ULTIMO_ADMIN" } }); // REQ-ADM-3.5
    expect((await app.query("SELECT activo FROM usuario WHERE id = $1", [admin.id])).rows[0].activo).toBe(true);
  });

  it("desactivar a un usuario revoca sus sesiones al instante", async () => {
    await llamar(rutaUsuario.PATCH, "PATCH", "/x", { ...admin, cuerpo: { activo: true } }, { id: (await app.query("SELECT id FROM usuario WHERE email = 'bodega@neltume.cl'")).rows[0].id });
    const bodega = await entrar("bodega@neltume.cl", "10.4.0.2");
    expect((await llamar(rutaSesion.GET, "GET", "/api/v1/sesion", bodega)).estado).toBe(200);
    await llamar(rutaUsuario.PATCH, "PATCH", "/x", { ...admin, cuerpo: { activo: false } }, { id: bodega.id });
    expect((await llamar(rutaSesion.GET, "GET", "/api/v1/sesion", bodega)).estado).toBe(401);
  });

  it("un perfil nuevo se crea como datos y rechaza permisos inexistentes", async () => {
    const ok = await llamar(rutaRoles.POST, "POST", "/api/v1/roles", { ...admin, cuerpo: { nombre: "Bodega", permisos: ["stock.ver", "stock.mover"] } });
    expect(ok.estado).toBe(201);
    expect(ok.cuerpo.permisos).toEqual(["stock.ver", "stock.mover"]);
    const mal = await llamar(rutaRoles.POST, "POST", "/api/v1/roles", { ...admin, cuerpo: { nombre: "rara", permisos: ["todo.poder"] } });
    expect(mal.estado).toBe(400);
  });

  it("no permite quitar usuarios.gestionar al rol del último administrador", async () => {
    const sinGestion = CODIGOS_PERMISO.filter((p) => p !== "usuarios.gestionar");
    const r = await llamar(rutaRolPermisos.PUT, "PUT", "/x", { ...admin, cuerpo: { permisos: sinGestion } }, { id: rolAdminId });
    expect(r.estado).toBe(422);
    const { rows } = await app.query("SELECT count(*)::int AS n FROM rol_permiso WHERE rol_id = $1", [rolAdminId]);
    expect(rows[0].n).toBe(19);
  });

  it("cada cambio queda auditado con antes y después", async () => {
    const { rows } = await app.query("SELECT accion, recurso FROM audit_log WHERE actor_id = $1 AND resultado = 'ok'", [admin.id]);
    const acciones = rows.map((r) => `${r.recurso}:${r.accion}`);
    expect(acciones).toEqual(expect.arrayContaining(["usuario:crear", "usuario:actualizar", "rol:crear"]));
  });
});
