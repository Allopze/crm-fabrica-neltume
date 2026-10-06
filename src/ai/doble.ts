// Doble determinista del LLM (TESTING §2, AI.md §5). Nunca se usa en producción.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Propuesta } from "./esquema";
import { ErrorIA, type InterpreteIA, type OpcionesInterpretacion, type ResultadoInterpretacion } from "./interfaz";

type Escenario = "timeout" | "error500" | "invalida" | "sin_zdr";
/** `correccion`: lo que responde en la segunda pasada, cuando el sistema le indica partes omitidas (REQ-COT-2.15). */
interface Entrada { clave: string; propuesta?: unknown; correccion?: unknown; escenario?: Escenario }

const plano = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ");

export class DobleIA implements InterpreteIA {
  readonly nombre = "doble";
  private readonly respuestas: Entrada[];
  /** Peticiones recibidas: los tests verifican que no viajan datos personales (REQ-COT-2.9). */
  readonly peticiones: string[] = [];
  /** Partes omitidas que recibió en cada segunda pasada. */
  readonly correcciones: string[][] = [];

  constructor(archivo = path.join(process.cwd(), "tests/fixtures/ia-respuestas.json")) {
    if (process.env.NODE_ENV === "production") throw new Error("El doble del LLM no puede usarse en producción");
    const datos = JSON.parse(readFileSync(archivo, "utf8")) as { respuestas: Entrada[] };
    this.respuestas = [...datos.respuestas].sort((a, b) => b.clave.length - a.clave.length);
  }

  // El doble ignora el catálogo: sus respuestas son fijas.
  async interpretar(texto: string, _catalogo?: unknown, opciones: OpcionesInterpretacion = {}): Promise<ResultadoInterpretacion> {
    this.peticiones.push(texto);
    if (opciones.omitidos?.length) this.correcciones.push(opciones.omitidos);
    const inicio = Date.now();
    const entrada = this.respuestas.find((r) => plano(texto).includes(plano(r.clave)));
    switch (entrada?.escenario) {
      case "timeout": throw new ErrorIA("timeout", "El servicio de IA no respondió a tiempo (simulado)");
      case "error500": throw new ErrorIA("transitorio", "Error 500 del proveedor (simulado)");
      case "sin_zdr": throw new ErrorIA("sin_zdr", "Sin proveedor con retención cero disponible (simulado)");
      case "invalida": {
        const r = Propuesta.safeParse({ items: [{ precio_unitario: 1 }], alertas: [], sin_items: false });
        throw new ErrorIA("invalida", `Salida inválida: ${r.success ? "" : r.error.issues[0]?.message}`);
      }
    }
    const fuente = opciones.omitidos?.length && entrada?.correccion ? entrada.correccion : entrada?.propuesta;
    const propuesta = fuente
      ? Propuesta.parse(fuente)
      : { items: [], alertas: ["El doble no reconoce este texto."], sin_items: true };
    return { propuesta, proveedor: this.nombre, modelo: "doble-v1", tokensEntrada: Math.ceil(texto.length / 4), tokensSalida: 200, costoUsd: 0, latenciaMs: Date.now() - inicio };
  }
}
