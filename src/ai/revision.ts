// Interpretación revisada (REQ-COT-2.14, 2.15): la propuesta de la IA se ancla al texto y, si dejó partes del pedido
// sin registrar, se le pide UNA corrección indicándole cuáles (como la tienda). Se queda con la segunda solo si cubre
// más; si la segunda falla, sigue la primera. Lo no respaldado queda por confirmar; solo se corrige lo que la línea dice
// sin ambigüedad (ADR-0013).
import { anclarPropuesta, cantidadPedidoEliptico, type NombresModelo } from "@/domain/cotizaciones/anclaje";
import type { Propuesta } from "./esquema";
import type { CatalogoResumido, InterpreteIA, ResultadoInterpretacion } from "./interfaz";
import { type Intento, interpretarConReintentos } from "./reintentos";

export interface InterpretacionRevisada {
  resultado: ResultadoInterpretacion; // el elegido, con tokens y costo de ambas pasadas
  anclada: Propuesta;
  /** Dudas de la IA por ítem de `anclada` (ADR-0013 B). */
  dudasIa: string[][];
  corregida: boolean;
}

type Opciones = { esperasMs?: number[]; alIntentar?: (i: Intento) => Promise<void> | void };

/** Conserva pedidos por destino que ambas lecturas omitieron, sin asignarles un producto (REQ-COT-2.14/2.15). */
function conservarElipticos(anclada: ReturnType<typeof anclarPropuesta>) {
  const pendientes = anclada.omitidos.flatMap((frase) => {
    const cantidad = cantidadPedidoEliptico(frase);
    return cantidad === null ? [] : [{
      texto_fuente: frase, tipo: "desconocido" as const, modelo: null, madera: null, ancho_m: null, alto_m: null,
      medida_accesorio: null, cantidad, tipo_medida: null, dudas: ["Falta definir el producto, el modelo, la madera y la medida."],
    }];
  });
  if (!pendientes.length) return anclada;
  const cubiertos = new Set(pendientes.map((p) => p.texto_fuente));
  return {
    ...anclada,
    dudasIa: [...anclada.dudasIa, ...pendientes.map(() => [] as string[])],
    propuesta: {
      ...anclada.propuesta,
      sin_items: false,
      items: [...anclada.propuesta.items, ...pendientes],
      alertas: [
        ...anclada.propuesta.alertas.filter((a) => ![...cubiertos].some((f) => a === `No registré: «${f}». Agrégalo a mano si corresponde.`)),
        ...pendientes.map((p) => `No pude identificar el producto de «${p.texto_fuente}»; lo dejé por confirmar.`),
      ],
    },
  };
}

export async function interpretarRevisado(
  ia: InterpreteIA, texto: string, resumido: CatalogoResumido, nombres: NombresModelo, opciones: Opciones = {},
): Promise<InterpretacionRevisada> {
  const primero = await interpretarConReintentos(ia, texto, resumido, opciones);
  const a1 = anclarPropuesta(primero.propuesta, texto, nombres);
  if (!a1.omitidos.length) return { resultado: primero, anclada: a1.propuesta, dudasIa: a1.dudasIa, corregida: false };

  let segundo: ResultadoInterpretacion;
  try {
    segundo = await interpretarConReintentos(ia, texto, resumido, { ...opciones, maxReintentos: 0, omitidos: a1.omitidos });
  } catch {
    const final = conservarElipticos(a1);
    return { resultado: primero, anclada: final.propuesta, dudasIa: final.dudasIa, corregida: false };
  }
  const suma = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  const gasto = {
    tokensEntrada: suma(primero.tokensEntrada, segundo.tokensEntrada), tokensSalida: suma(primero.tokensSalida, segundo.tokensSalida),
    costoUsd: suma(primero.costoUsd, segundo.costoUsd), latenciaMs: primero.latenciaMs + segundo.latenciaMs,
  };
  const a2 = anclarPropuesta(segundo.propuesta, texto, nombres);
  const mejor = a2.omitidos.length < a1.omitidos.length && segundo.propuesta.items.length >= primero.propuesta.items.length;
  const elegido = conservarElipticos(mejor ? a2 : a1);
  return {
    resultado: { ...(mejor ? segundo : primero), ...gasto },
    anclada: elegido.propuesta, dudasIa: elegido.dudasIa, corregida: mejor,
  };
}
