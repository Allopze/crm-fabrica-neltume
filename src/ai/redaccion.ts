// Enmascarado de datos personales ANTES de enviar texto al LLM (SECURITY §4, REQ-COT-2.9). Los patrones viven en
// src/lib/datos-personales.ts, compartidos con los logs.
import { enmascararDatosPersonales } from "@/lib/datos-personales";

export function redactar(texto: string): { texto: string; reemplazos: number } {
  return enmascararDatosPersonales(texto);
}

/** Normaliza el texto del pedido: espacios, comillas, "×" y separadores de medida (DESIGN §3, paso 2). */
export function normalizarPedido(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/(\d)\s*[×xX*]\s*(\d)/g, "$1x$2")
    .replace(/[ \t]+/g, " ")
    .trim();
}
