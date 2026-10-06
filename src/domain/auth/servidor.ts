// Sesión en componentes de servidor (páginas). Las páginas también verifican permisos:
// la UI solo oculta, pero nunca muestra datos sin autorización (SECURITY §2).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION } from "./politica";
import { validarSesion } from "./sesiones";

export async function sesionActual() {
  return validarSesion((await cookies()).get(COOKIE_SESION)?.value);
}

/** Exige sesión; sin ella redirige al login. */
export async function requerirSesion() {
  const s = await sesionActual();
  if (!s) redirect("/login");
  return s;
}
