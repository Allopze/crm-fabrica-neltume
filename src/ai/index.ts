// Punto único para obtener el intérprete (ADR-0001). LLM_PROVEEDOR: "commandcode" | "doble".
import { DobleIA } from "./doble";
import type { InterpreteIA } from "./interfaz";
import { CommandCodeIA, baseDeApi } from "./proveedores/commandcode";
import { GroqIA } from "./proveedores/groq";
import { claveActivaParaWorker, leerCatalogo, leerConfiguracionPrivada, type ConfiguracionPrivadaIA } from "./ajustes";

/** Resuelve una instantánea de configuración por trabajo; nunca se lee una clave desde la app web. */
export async function crearInterpreteDesdeAjustes(configTomada?: ConfiguracionPrivadaIA): Promise<InterpreteIA> {
  const config = configTomada ?? await leerConfiguracionPrivada();
  const activa = await claveActivaParaWorker(config);
  if (!activa) {
    if (process.env.LLM_PROVEEDOR === "doble" && process.env.NODE_ENV !== "production") return new DobleIA();
    throw new Error("No hay un proveedor activo en Ajustes de IA");
  }
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 12_000);
  if (activa.proveedor === "groq") return new GroqIA({ apiKey: activa.apiKey, modelo: activa.modelo, timeoutMs, maxTokensSalida: Number(process.env.LLM_MAX_TOKENS_SALIDA || 2_000), baseUrl: process.env.GROQ_API_BASE_URL });
  const catalogo = await leerCatalogo("commandcode");
  const elegido = catalogo.modelos.find((m) => m.id === activa.modelo);
  return new CommandCodeIA({
    apiKey: activa.apiKey, modelo: activa.modelo, baseUrl: baseDeApi(process.env.CMD_API_BASE_URL), timeoutMs,
    maxTokensSalida: Number(process.env.LLM_MAX_TOKENS_SALIDA || 2_000),
    precioEntradaMTok: elegido?.precioEntradaUsdMTok ?? 0,
    precioSalidaMTok: elegido?.precioSalidaUsdMTok ?? 0,
  });
}
