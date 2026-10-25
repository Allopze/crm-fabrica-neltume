import { Client } from "pg";
import { conBase, ident, partesUrl, urlCompras, urlEnlace, urlWorker } from "./urls";

/** Crea (o actualiza) los roles dueño, app, worker, compras y enlace (ADR-0017, 0021, 0024). Requiere una conexión de superusuario. */
export async function asegurarRoles(
  urlAdmin: string, urlOwner: string, urlApp: string,
  urlDelWorker = urlWorker(urlApp), urlDeCompras = urlCompras(urlApp), urlDelEnlace = urlEnlace(urlApp),
): Promise<void> {
  const owner = partesUrl(urlOwner);
  const app = partesUrl(urlApp);
  const worker = partesUrl(urlDelWorker);
  const compras = partesUrl(urlDeCompras);
  const enlace = partesUrl(urlDelEnlace);
  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    for (const [rol, extra] of [[owner, "CREATEDB"], [app, ""], [worker, ""], [compras, ""], [enlace, ""]] as const) {
      const existe = (await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [rol.usuario])).rowCount;
      const verbo = existe ? "ALTER" : "CREATE";
      // La clave va como literal escapado por el servidor (format %L), nunca concatenada.
      const { rows } = await cliente.query("SELECT format('%L', $1::text) AS clave", [rol.clave]);
      await cliente.query(`${verbo} ROLE ${ident(rol.usuario)} WITH LOGIN ${extra} PASSWORD ${rows[0].clave}`);
    }
    // Solo dev/test: el dueño puede cortar conexiones (p. ej. del worker) al recrear las bases de prueba.
    if (process.env.NODE_ENV !== "production") await cliente.query(`GRANT pg_signal_backend TO ${ident(owner.usuario)}`);
  } finally {
    await cliente.end();
  }
}

/** Crea la base si no existe, con el dueño correcto y CONNECT solo para dueño, app, worker, compras y enlace. */
export async function asegurarBase(urlConexion: string, urlOwner: string, urlApp: string, base: string, recrear = false): Promise<void> {
  const owner = partesUrl(urlOwner).usuario;
  const app = partesUrl(urlApp).usuario;
  const worker = partesUrl(urlWorker(urlApp)).usuario;
  const compras = partesUrl(urlCompras(urlApp)).usuario;
  const enlace = partesUrl(urlEnlace(urlApp)).usuario;
  const cliente = new Client({ connectionString: conBase(urlConexion, "postgres") });
  await cliente.connect();
  try {
    if (recrear) await cliente.query(`DROP DATABASE IF EXISTS ${ident(base)} WITH (FORCE)`);
    const existe = (await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [base])).rowCount;
    if (!existe) await cliente.query(`CREATE DATABASE ${ident(base)} OWNER ${ident(owner)}`);
    await cliente.query(`REVOKE CONNECT ON DATABASE ${ident(base)} FROM PUBLIC`);
    await cliente.query(`GRANT CONNECT ON DATABASE ${ident(base)} TO ${ident(app)}`);
    // Los roles del worker, de compras y de enlace los crea `db:setup` (superusuario); sin ellos, la base sigue usable por la app.
    for (const rol of [worker, compras, enlace]) {
      if ((await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [rol])).rowCount) {
        await cliente.query(`GRANT CONNECT ON DATABASE ${ident(base)} TO ${ident(rol)}`);
      }
    }
  } finally {
    await cliente.end();
  }
  const enBase = new Client({ connectionString: conBase(urlConexion, base) });
  await enBase.connect();
  try {
    await enBase.query(`ALTER SCHEMA public OWNER TO ${ident(owner)}`).catch(() => undefined);
    await enBase.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  } finally {
    await enBase.end();
  }
}
