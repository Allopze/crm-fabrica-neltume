// `npm run crear-admin`: crea un usuario administrador. La contraseña se pide por consola y no se guarda en archivos.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { bd, cerrarBd } from "../src/db/conexion";
import { LARGO_MINIMO } from "../src/domain/auth/password";
import { crearUsuario } from "../src/domain/usuarios";

let silenciar = false;
const salida = new Writable({ write(trozo, _codif, listo) { if (!silenciar) process.stdout.write(trozo); listo(); } });
const rl = createInterface({ input: process.stdin, output: salida, terminal: Boolean(process.stdin.isTTY) });
const lineas = rl[Symbol.asyncIterator]();

// Lee una línea por pregunta; con `oculto` no se hace eco de lo escrito.
async function preguntar(texto: string, oculto = false): Promise<string> {
  process.stdout.write(texto);
  silenciar = oculto;
  const { value } = await lineas.next();
  silenciar = false;
  if (oculto) process.stdout.write("\n");
  return String(value ?? "").trim();
}

const email = await preguntar("Correo: ");
const nombre = await preguntar("Nombre: ");
const clave = await preguntar(`Contraseña (mín. ${LARGO_MINIMO} caracteres): `, true);
rl.close();

try {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email, nombre, clave }, { tipo: "sistema" }, "consola"));
  console.log(`✓ Administrador ${u.email} creado`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
