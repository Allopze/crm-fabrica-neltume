import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaMp from "@/app/api/v1/materias-primas/route";
import * as rutaMinimo from "@/app/api/v1/materias-primas/[id]/minimo/route";
import * as rutaMpId from "@/app/api/v1/materias-primas/[id]/route";
import * as rutaAlertasMp from "@/app/api/v1/materias-primas/alertas/route";
import * as rutaAjuste from "@/app/api/v1/movimientos/ajustes/route";
import * as rutaRecepcion from "@/app/api/v1/recepciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
type S = { token: string; csrf: string };
let admin: S;
let lector: S;
const idem = () => ({ "idempotency-key": randomUUID() });
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-mp-123" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};
const existencia = async (id: string) => (await llamar(rutaMp.GET, "GET", "/x", admin)).cuerpo.datos.find((m: { id: string }) => m.id === id).existencia;

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('ver-stock') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'stock.ver' FROM rol WHERE nombre = 'ver-stock' ON CONFLICT DO NOTHING");
  await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "mp@neltume.cl", nombre: "MP", clave: "clave-mp-123" }, { tipo: "sistema" }, "consola");
    await crearUsuario(tx, { email: "mp-lee@neltume.cl", nombre: "L", clave: "clave-mp-123", rolNombre: "ver-stock" }, { tipo: "sistema" }, "consola");
  });
  admin = await entrar("mp@neltume.cl", "10.9.0.1");
  lector = await entrar("mp-lee@neltume.cl", "10.9.0.2");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("materias primas y recepciones (REQ-MP-1, 2, 5)", () => {
  let tabla: string;

  it("crea una materia prima con unidad y rechaza nombre repetido o unidad inexistente", async () => {
    const r = await llamar(rutaMp.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "Tabla raulí 1\"", unidadCodigo: "pulg", stockMinimo: 300 } });
    expect(r.estado).toBe(201);
    tabla = r.cuerpo.id;
    expect((await llamar(rutaMp.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "TABLA RAULÍ 1\"", unidadCodigo: "pulg" } })).estado).toBe(400);
    expect((await llamar(rutaMp.POST, "POST", "/x", { ...admin, cuerpo: { nombre: "Cola", unidadCodigo: "barril" } })).estado).toBe(400);
  });

  it("una recepción suma existencia; el doble envío con la misma clave cuenta una vez", async () => {
    const cab = idem();
    await llamar(rutaRecepcion.POST, "POST", "/x", { ...admin, cabeceras: cab, cuerpo: { materiaPrimaId: tabla, cantidad: 120.5, referencia: "Guía 18.442" } });
    await llamar(rutaRecepcion.POST, "POST", "/x", { ...admin, cabeceras: cab, cuerpo: { materiaPrimaId: tabla, cantidad: 120.5, referencia: "Guía 18.442" } });
    expect(await existencia(tabla)).toBe(120.5);
  });

  it("rechaza cantidades cero o negativas", async () => {
    expect((await llamar(rutaRecepcion.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: 0 } })).estado).toBe(400);
    expect((await llamar(rutaRecepcion.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: -3 } })).estado).toBe(400);
  });

  it("ajuste de materia prima con motivo (decimales permitidos) y sin dejar negativo", async () => {
    expect((await llamar(rutaAjuste.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: -0.5, motivo: "Merma por humedad" } })).estado).toBe(201);
    expect(await existencia(tabla)).toBe(120);
    expect((await llamar(rutaAjuste.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: -500, motivo: "Error" } })).estado).toBe(409);
  });

  it("ajuste de MP: motivo obligatorio, sin stock.ajustar → 403, y queda auditado (REQ-MP-5.1, 5.2)", async () => {
    expect((await llamar(rutaAjuste.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: 2 } })).estado).toBe(400);
    expect((await llamar(rutaAjuste.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: 2, motivo: " " } })).estado).toBe(400);
    const r = await llamar(rutaAjuste.POST, "POST", "/api/v1/movimientos/ajustes", { ...lector, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: 2, motivo: "Conteo" } });
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    expect(await existencia(tabla)).toBe(120);
    const { rows } = await app.query("SELECT resultado, despues FROM audit_log WHERE recurso = 'materia_prima' AND accion = 'ajuste' ORDER BY id");
    expect(rows.at(-1)).toMatchObject({ resultado: "ok", despues: { cantidad: -0.5, motivo: "Merma por humedad" } });
    const den = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'POST /api/v1/movimientos/ajustes'");
    expect(den.rows).toHaveLength(1);
  });

  it("mínimo con config.editar y alertas de reposición; sin permiso → 403 auditado (REQ-MP-6.1, 6.2)", async () => {
    const r = await llamar(rutaMinimo.PATCH, "PATCH", "/x", { ...admin, cuerpo: { stockMinimo: 150 } }, { id: tabla });
    expect(r.cuerpo.stockMinimo).toBe(150);
    const a = (await llamar(rutaAlertasMp.GET, "GET", "/x", lector)).cuerpo.datos;
    expect(a).toEqual([expect.objectContaining({ id: tabla, existencia: 120, minimo: 150, faltan: 30 })]);
    // El PATCH general ya no cambia el mínimo: es configuración.
    expect((await llamar(rutaMpId.PATCH, "PATCH", "/x", { ...admin, cuerpo: { stockMinimo: 1 } }, { id: tabla })).estado).toBe(400);
    const d = await llamar(rutaMinimo.PATCH, "PATCH", `/api/v1/materias-primas/${tabla}/minimo`, { ...lector, cuerpo: { stockMinimo: 0 } }, { id: tabla });
    expect(d.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion LIKE 'PATCH %/minimo'");
    expect(rows).toHaveLength(1);
    expect((await llamar(rutaMp.POST, "POST", "/x", { ...lector, cuerpo: { nombre: "Barniz", unidadCodigo: "lt" } })).estado).toBe(403);
    expect((await llamar(rutaRecepcion.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { materiaPrimaId: tabla, cantidad: 1 } })).estado).toBe(403);
  });
});
