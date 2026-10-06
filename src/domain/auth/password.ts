import { hash, verify } from "@node-rs/argon2";
import { ErrorDominio } from "../errores";
import { LARGO_MINIMO_CLAVE } from "./reglas";

// argon2id con parámetros mínimos recomendados por OWASP (19 MiB, 2 iteraciones).
const OPCIONES = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(clave: string): Promise<string> {
  if (clave.length < LARGO_MINIMO_CLAVE) {
    throw new ErrorDominio("VALIDACION", `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`);
  }
  return hash(clave, OPCIONES);
}

export async function verificarPassword(hashGuardado: string, clave: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, clave);
  } catch {
    return false;
  }
}

// Hash de una clave aleatoria: se compara cuando el correo no existe, para no revelar
// por tiempo de respuesta si una cuenta existe (SECURITY T7).
let hashSenuelo: Promise<string> | undefined;
export function hashFalso(): Promise<string> {
  hashSenuelo ??= hash(crypto.randomUUID(), OPCIONES);
  return hashSenuelo;
}
