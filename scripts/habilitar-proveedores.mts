// `npx tsx --env-file-if-exists=.env.local scripts/habilitar-proveedores.mts [--usuario correo] "RUT=Nombre"…` (en
// producción: `docker compose run --rm -T migrar npx tsx scripts/habilitar-proveedores.mts …`): habilita proveedores
// de Chipax por RUT, igual que Materias primas → Compras (REQ-MP-7.1, ADR-0021). Desde hoy se leen sus facturas y las
// recepciones quedan a nombre del usuario (por defecto, el primer administrador). Auditado; los ya habilitados se saltan.
import { asc, eq } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { usuario } from "../src/db/esquema/seguridad";
import { habilitarProveedor, listarProveedores } from "../src/domain/compras/proveedores";
import { ErrorDominio } from "../src/domain/errores";
import { formatearRut, normalizarRut } from "../src/domain/rut";

const args = process.argv.slice(2);
const iUsuario = args.indexOf("--usuario");
const correo = iUsuario >= 0 ? args.splice(iUsuario, 2)[1] : null;
try {
  const pares = args.map((a) => {
    const i = a.indexOf("=");
    if (i < 1) throw new Error(`«${a}»: usa el formato "RUT=Nombre".`);
    return { rut: a.slice(0, i).trim(), nombre: a.slice(i + 1).trim() };
  });
  if (!pares.length) throw new Error('Uso: scripts/habilitar-proveedores.mts [--usuario correo] "76.452.633-3=Ferretería Jaramillo Ltda." …');
  const [u] = correo
    ? await bd().select().from(usuario).where(eq(usuario.email, correo.toLowerCase()))
    : await bd().select().from(usuario).orderBy(asc(usuario.creadoEn)).limit(1);
  if (!u?.activo) throw new Error(correo ? `No hay un usuario activo con el correo ${correo}.` : "Crea primero un usuario con `npm run crear-admin`.");
  const activos = new Set((await listarProveedores(bd())).filter((p) => p.activo).map((p) => p.rut));
  for (const p of pares) {
    const rut = normalizarRut(p.rut) ?? p.rut;
    if (activos.has(rut)) { console.log(`= ${formatearRut(rut)} ${p.nombre}: ya estaba habilitado.`); continue; }
    try {
      const r = await bd().transaction((tx) => habilitarProveedor(tx, p, { tipo: "usuario", id: u.id }, "consola"));
      console.log(`✓ ${formatearRut(r.rut)} ${r.nombre}: habilitado desde el ${r.habilitadoDesde.split("-").reverse().join("-")}.`);
    } catch (e) {
      if (!(e instanceof ErrorDominio)) throw e;
      console.log(`✗ ${p.rut} ${p.nombre}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`Recepciones automáticas a nombre de ${u.nombre}.`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
