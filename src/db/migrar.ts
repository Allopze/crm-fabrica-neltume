import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { sembrar } from "./semilla";
import { ident, partesUrl, urlCompras, urlWorker } from "./urls";

const CARPETA = path.join(process.cwd(), "src/db/migraciones");

/** Tablas donde el rol de la app solo puede insertar y leer (SECURITY §2, ADR-0002). */
export const TABLAS_SOLO_INSERCION = ["audit_log", "movimiento", "precio", "llamada_ia", "despacho_historico", "pago_pedido"];

/**
 * Aplica las migraciones con el dueño del esquema, ajusta los permisos del rol de la app y siembra
 * permisos y rol administrador.
 * Idempotente: se puede correr en cada arranque.
 */
export async function migrar(urlOwner: string, urlApp: string): Promise<void> {
  const cliente = new Client({ connectionString: urlOwner });
  await cliente.connect();
  try {
    if (existsSync(path.join(CARPETA, "meta/_journal.json"))) {
      await migrate(drizzle(cliente), { migrationsFolder: CARPETA });
    }
    await aplicarPermisos(cliente, partesUrl(urlApp).usuario);
    await aplicarPermisosWorker(cliente, partesUrl(urlWorker(urlApp)).usuario);
    await aplicarPermisosCompras(cliente, partesUrl(urlCompras(urlApp)).usuario);
    await sembrar(cliente);
  } finally {
    await cliente.end();
  }
}

async function aplicarPermisos(cliente: Client, rolApp: string): Promise<void> {
  const app = ident(rolApp);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
  for (const tabla of TABLAS_SOLO_INSERCION) {
    const { rowCount } = await cliente.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1", [tabla]);
    if (rowCount) await cliente.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${ident(tabla)} FROM ${app}`);
  }
}

/**
 * Permisos mínimos del worker de IA (ADR-0017): lee el catálogo resumido y solo el precio neto (nunca costos ni
 * márgenes), escribe la interpretación y su registro. No ve usuarios, clientes, stock ni permisos. Si el rol aún no
 * existe (falta `npm run db:setup`), se avisa y se sigue: la app no lo necesita.
 */
async function aplicarPermisosWorker(cliente: Client, rolWorker: string): Promise<void> {
  if (!(await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [rolWorker])).rowCount) {
    process.stderr.write(`Aviso: no existe el rol ${rolWorker} del worker de IA; ejecuta \`npm run db:setup\` (ADR-0017).\n`);
    return;
  }
  const w = ident(rolWorker);
  await cliente.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${w}`);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO ${w}`);
  await cliente.query(`GRANT SELECT ON modelo, madera, rango_ancho, alto, articulo, alias_modelo, lista_precio, recargo_tipo, parametro, cotizacion, cotizacion_item, trabajo_ia, llamada_ia TO ${w}`);
  await cliente.query(`GRANT SELECT (lista_id, articulo_id, precio_neto) ON precio TO ${w}`);
  await cliente.query(`GRANT INSERT ON cotizacion_item, llamada_ia, audit_log, parametro TO ${w}`);
  await cliente.query(`GRANT UPDATE ON cotizacion, trabajo_ia, parametro TO ${w}`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${w}`);
}

/**
 * Permisos mínimos del servicio de compras desde Chipax (ADR-0021): lee proveedores, mapeos y materias primas, e
 * inserta compras, sus líneas, recepciones y auditoría. Lee `movimiento` porque el trigger de saldo no negativo corre
 * con sus permisos. Un trigger le impide cualquier movimiento que no sea una recepción de materia prima.
 */
async function aplicarPermisosCompras(cliente: Client, rolCompras: string): Promise<void> {
  if (!(await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [rolCompras])).rowCount) {
    process.stderr.write(`Aviso: no existe el rol ${rolCompras} del servicio de compras; ejecuta \`npm run db:setup\` (ADR-0021).\n`);
    return;
  }
  const c = ident(rolCompras);
  await cliente.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${c}`);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO ${c}`);
  await cliente.query(`GRANT SELECT ON proveedor_compra, mapeo_item_compra, materia_prima, unidad, parametro, bodega, compra, compra_linea, sincronizacion_chipax, movimiento, v_stock TO ${c}`);
  await cliente.query(`GRANT INSERT ON compra, compra_linea, movimiento, audit_log, sincronizacion_chipax TO ${c}`);
  await cliente.query(`GRANT UPDATE ON compra, sincronizacion_chipax TO ${c}`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${c}`);
  // El nombre del rol va como literal escapado por el servidor (format %L), nunca concatenado.
  const { rows } = await cliente.query("SELECT format('%L', $1::text) AS rol", [rolCompras]);
  await cliente.query(`CREATE OR REPLACE FUNCTION movimiento_rol_compras() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = ${rows[0].rol} AND (NEW.tipo <> 'recepcion' OR NEW.materia_prima_id IS NULL) THEN
    RAISE EXCEPTION 'El servicio de compras solo registra recepciones de materias primas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$`);
}

