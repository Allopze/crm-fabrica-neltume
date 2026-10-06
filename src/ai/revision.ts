// Interpretación revisada (REQ-COT-2.14, 2.15): la propuesta de la IA se ancla al texto y, si dejó partes del pedido
// sin registrar, se le pide UNA corrección indicándole cuáles (como la tienda). Se queda con la segunda solo si cubre
// más; si la segunda falla, sigue la primera. Nada de esto corrige datos: lo no respaldado queda por confirmar.
import { anclarPropuesta, type NombresModelo } from "@/domain/cotizaciones/anclaje";
import type { Propuesta } from "./esquema";
import type { CatalogoResumido, InterpreteIA, ResultadoInterpretacion } from "./interfaz";
import { type Intento, interpretarConReintentos } from "./reintentos";

export interface InterpretacionRevisada {
  resultado: ResultadoInterpretacion; // el elegido, con tokens y costo de ambas pasadas
  anclada: Propuesta;
  corregida: boolean;
}

type Opciones = { esperasMs?: number[]; alIntentar?: (i: Intento) => Promise<void> | void };

export async function interpretarRevisado(
  ia: InterpreteIA, texto: string, resumido: CatalogoResumido, nombres: NombresModelo, opciones: Opciones = {},
): Promise<InterpretacionRevisada> {
  const primero = await interpretarConReintentos(ia, texto, resumido, opciones);
  const a1 = anclarPropuesta(primero.propuesta, texto, nombres);
  if (!a1.omitidos.length) return { resultado: primero, anclada: a1.propuesta, corregida: false };

  let segundo: ResultadoInterpretacion;
  try {
    segundo = await interpretarConReintentos(ia, texto, resumido, { ...opciones, maxReintentos: 0, omitidos: a1.omitidos });
  } catch {
    return { resultado: primero, anclada: a1.propuesta, corregida: false };
  }
  const suma = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  const gasto = {
    tokensEntrada: suma(primero.tokensEntrada, segundo.tokensEntrada), tokensSalida: suma(primero.tokensSalida, segundo.tokensSalida),
    costoUsd: suma(primero.costoUsd, segundo.costoUsd), latenciaMs: primero.latenciaMs + segundo.latenciaMs,
  };
  const a2 = anclarPropuesta(segundo.propuesta, texto, nombres);
  const mejor = a2.omitidos.length < a1.omitidos.length && segundo.propuesta.items.length >= primero.propuesta.items.length;
  return mejor
    ? { resultado: { ...segundo, ...gasto }, anclada: a2.propuesta, corregida: true }
    : { resultado: { ...primero, ...gasto }, anclada: a1.propuesta, corregida: false };
}
