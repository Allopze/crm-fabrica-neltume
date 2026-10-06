// Adaptador Groq Chat Completions (REQ-ADM-4.2). No entrega herramientas de escritura al proveedor.
import { HERRAMIENTA_PROPONER_ITEMS, Propuesta } from "../esquema";
import { type CatalogoResumido, ErrorIA, type InterpreteIA, type OpcionesInterpretacion, type ResultadoInterpretacion } from "../interfaz";
import { mensajeUsuario, promptSistema } from "../prompt";
import { leerRetryAfterMs } from "../retry-after";

export interface ConfigGroq { apiKey: string; modelo: string; timeoutMs: number; maxTokensSalida?: number; baseUrl?: string }
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export class GroqIA implements InterpreteIA {
  readonly nombre = "groq";
  constructor(private readonly cfg: ConfigGroq, private readonly fetchFn: typeof fetch = fetch) {}

  async interpretar(texto: string, catalogo: CatalogoResumido, opciones: OpcionesInterpretacion = {}): Promise<ResultadoInterpretacion> {
    const inicio = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${(this.cfg.baseUrl || GROQ_BASE_URL).replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.cfg.modelo, temperature: 0, max_tokens: this.cfg.maxTokensSalida || 2000,
          messages: [{ role: "system", content: promptSistema(catalogo) }, { role: "user", content: mensajeUsuario(texto, opciones.omitidos) }],
          tools: [HERRAMIENTA_PROPONER_ITEMS],
          tool_choice: { type: "function", function: { name: "proponer_items" } },
          parallel_tool_calls: false,
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (e) {
      const nombre = (e as Error).name;
      if (nombre === "TimeoutError" || nombre === "AbortError") throw new ErrorIA("timeout", `Sin respuesta en ${this.cfg.timeoutMs} ms`);
      throw new ErrorIA("transitorio", "No se pudo conectar con Groq");
    }

    if (!res.ok) {
      await res.text().catch(() => "");
      if (res.status === 408 || res.status === 429 || res.status >= 500) {
        throw new ErrorIA("transitorio", `Groq respondió ${res.status}`, res.status === 429 ? leerRetryAfterMs(res.headers.get("retry-after")) : undefined);
      }
      throw new ErrorIA("permanente", `Groq respondió ${res.status}`);
    }

    const cuerpo = await res.json().catch(() => null);
    if (cuerpo?.choices?.[0]?.finish_reason === "length") throw new ErrorIA("invalida", "La respuesta superó el tope de tokens de salida");
    const llamada = cuerpo?.choices?.[0]?.message?.tool_calls?.[0];
    if (llamada?.function?.name !== "proponer_items") throw new ErrorIA("invalida", "La respuesta no usó la herramienta proponer_items");
    let argumentos: unknown;
    try { argumentos = JSON.parse(llamada.function.arguments); }
    catch { throw new ErrorIA("invalida", "Los argumentos de la herramienta no son JSON"); }
    const propuesta = Propuesta.safeParse(argumentos);
    if (!propuesta.success) throw new ErrorIA("invalida", `Salida fuera del esquema: ${propuesta.error.issues[0]?.path.join(".")}`);
    return {
      propuesta: propuesta.data, proveedor: this.nombre, modelo: cuerpo.model ?? this.cfg.modelo,
      tokensEntrada: Number(cuerpo.usage?.prompt_tokens ?? 0), tokensSalida: Number(cuerpo.usage?.completion_tokens ?? 0),
      latenciaMs: Date.now() - inicio,
    };
  }
}
