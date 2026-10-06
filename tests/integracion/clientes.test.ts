import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaId from "@/app/api/v1/clientes/[id]/route";
import * as rutaClientes from "@/app/api/v1/clientes/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
type S = { token: string; csrf: string };
let admin: S;
let otro: S;
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-clientes" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('solo-stock') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'stock.ver' FROM rol WHERE nombre = 'solo-stock' ON CONFLICT DO NOTHING");
  await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "ventas@neltume.cl", nombre: "V", clave: "clave-clientes" }, { tipo: "sistema" }, "consola");
    await crearUsuario(tx, { email: "otro@neltume.cl", nombre: "O", clave: "clave-clientes", rolNombre: "solo-stock" }, { tipo: "sistema" }, "consola");
  });
  admin = await entrar("ventas@neltume.cl", "10.11.0.1");
  otro = await entrar("otro@neltume.cl", "10.11.0.2");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("clientes (REQ-COT-9)", () => {
  let id: string;

  it("crea un cliente con RUT válido, normalizado", async () => {
    const r = await llamar(rutaClientes.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "Constructora Los Alerces SpA", rut: "12.345.678-5", comuna: "Puerto Varas", email: "javiera@alerces.cl" } });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.rut).toBe("12345678-5");
    id = r.cuerpo.id;
  });

  it("rechaza RUT inválido o repetido y correo inválido", async () => {
    expect((await llamar(rutaClientes.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "X", rut: "12.345.678-9" } })).estado).toBe(400);
    expect((await llamar(rutaClientes.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "Otra", rut: "12345678-5" } })).estado).toBe(400);
    expect((await llamar(rutaClientes.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "Otra", rut: "11.111.111-1", email: "no-es-correo" } })).estado).toBe(400);
  });

  it("busca por nombre, RUT con puntos o comuna", async () => {
    for (const q of ["alerces", "12.345", "puerto varas"]) {
      const r = await llamar(rutaClientes.GET, "GET", `/api/v1/clientes?q=${encodeURIComponent(q)}`, admin);
      expect(r.cuerpo.datos.map((c: { id: string }) => c.id)).toContain(id);
    }
  });

  it("actualizar audita solo los campos que cambiaron", async () => {
    await llamar(rutaId.PATCH, "PATCH", "/x", { ...admin, cuerpo: { telefono: "+56 9 1111 2222", comuna: "Puerto Varas" } }, { id });
    const { rows } = await app.query("SELECT antes, despues FROM audit_log WHERE recurso = 'cliente' AND accion = 'actualizar' AND recurso_id = $1", [id]);
    expect(rows[0]).toEqual({ antes: { telefono: null }, despues: { telefono: "+56 9 1111 2222" } });
  });

  it("sin clientes.ver: 403 en la lista y 404 en el detalle (sin revelar si existe)", async () => {
    expect((await llamar(rutaClientes.GET, "GET", "/x", otro)).estado).toBe(403);
    expect((await llamar(rutaId.GET, "GET", "/x", otro, { id })).estado).toBe(403);
    expect((await llamar(rutaId.GET, "GET", "/x", admin, { id: "no-es-uuid" })).estado).toBe(404);
  });
});
