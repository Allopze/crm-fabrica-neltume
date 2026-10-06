// Command Code Provider API, formato OpenAI chat/completions (ADR-0001). Lo específico del proveedor vive solo aquí.
import { HERRAMIENTA_PROPONER_ITEMS, Propuesta } from "../esquema";
import { type CatalogoResumido, ErrorIA, type InterpreteIA, type ResultadoInterpretacion } from "../interfaz";
import { mensajeUsuario, promptSistema } from "../prompt";

export interface ConfigCommandCode {
  apiKey: string;
  baseUrl: string;
  modelo: string;
  timeoutMs: number;
  /** Tope de tokens de salida: un pedido de varias líneas con dudas no debe quedar truncado. */
  maxTokensSalida?: number;
  precioEntradaMTok: number; // USD por millón de tokens
  precioSalidaMTok: number;
}

/** Raíz de la API: acepta también una URL copiada con la ruta del endpoint (…/provider/v1/responses). */
export function baseDeApi(url: string | undefined): string {
  return (url || "https://api.commandcode.ai").trim().replace(/\/+$/, "").replace(/\/provider\/v1(\/.*)?$/, "");
}

export const MAX_TOKENS_SALIDA = 2000;

export function configDesdeEntorno(): ConfigCommandCode {
  const apiKey = process.env.CMD_API_KEY;
  const modelo = process.env.CMD_MODEL;
  if (!apiKey || !modelo) throw new Error("Faltan CMD_API_KEY o CMD_MODEL para usar Command Code");
  return {
    apiKey, modelo,
    baseUrl: baseDeApi(process.env.CMD_API_BASE_URL),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 12_000),
    maxTokensSalida: Number(process.env.LLM_MAX_TOKENS_SALIDA || MAX_TOKENS_SALIDA),
    precioEntradaMTok: Number(process.env.LLM_PRECIO_ENTRADA_USD_MTOK || 0),
    precioSalidaMTok: Number(process.env.LLM_PRECIO_SALIDA_USD_MTOK || 0),
  };
}

export class CommandCodeIA implements InterpreteIA {
  readonly nombre = "commandcode";
  constructor(private readonly cfg: ConfigCommandCode, private readonly fetchFn: typeof fetch = fetch) {}

  async interpretar(texto: string, catalogo: CatalogoResumido): Promise<ResultadoInterpretacion> {
    const inicio = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.baseUrl}/provider/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json", "x-cmd-zdr": "1" },
        body: JSON.stringify({
          model: this.cfg.modelo,
          temperature: 0,
          max_tokens: this.cfg.maxTokensSalida || MAX_TOKENS_SALIDA,
          messages: [{ role: "system", content: promptSistema(catalogo) }, { role: "user", content: mensajeUsuario(texto) }],
          tools: [HERRAMIENTA_PROPONER_ITEMS],
          tool_choice: { type: "function", function: { name: "proponer_items" } },
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (e) {
      const nombre = (e as Error).name;
      if (nombre === "TimeoutError" || nombre === "AbortError") throw new ErrorIA("timeout", `Sin respuesta en ${this.cfg.timeoutMs} ms`);
      throw new ErrorIA("transitorio", "No se pudo conectar con el proveedor de IA");
    }

    if (!res.ok) {
      const detalle = (await res.text().catch(() => "")).slice(0, 300);
      if (/zdr|zero.?data/i.test(detalle)) throw new ErrorIA("sin_zdr", "No hay proveedor con retención cero disponible");
      if (res.status === 408 || res.status === 429 || res.status >= 500) throw new ErrorIA("transitorio", `Proveedor respondió ${res.status}`);
      throw new ErrorIA("permanente", `Proveedor respondió ${res.status}`);
    }

    const cuerpo = await res.json().catch(() => null);
    if (cuerpo?.choices?.[0]?.finish_reason === "length") throw new ErrorIA("invalida", "La respuesta superó el tope de tokens de salida (LLM_MAX_TOKENS_SALIDA)");
    const llamada = cuerpo?.choices?.[0]?.message?.tool_calls?.[0];
    if (llamada?.function?.name !== "proponer_items") throw new ErrorIA("invalida", "La respuesta no usó la herramienta proponer_items");
    let argumentos: unknown;
    try {
      argumentos = JSON.parse(llamada.function.arguments);
    } catch {
      throw new ErrorIA("invalida", "Los argumentos de la herramienta no son JSON");
    }
    const propuesta = Propuesta.safeParse(argumentos);
    if (!propuesta.success) throw new ErrorIA("invalida", `Salida fuera del esquema: ${propuesta.error.issues[0]?.path.join(".")}`);

    const tokensEntrada = Number(cuerpo.usage?.prompt_tokens ?? 0);
    const tokensSalida = Number(cuerpo.usage?.completion_tokens ?? 0);
    return {
      propuesta: propuesta.data, proveedor: this.nombre, modelo: cuerpo.model ?? this.cfg.modelo, tokensEntrada, tokensSalida,
      costoUsd: (tokensEntrada * this.cfg.precioEntradaMTok + tokensSalida * this.cfg.precioSalidaMTok) / 1_000_000,
      latenciaMs: Date.now() - inicio,
    };
  }
}
