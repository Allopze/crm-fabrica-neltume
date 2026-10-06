// Punto único para obtener el intérprete (ADR-0001). LLM_PROVEEDOR: "commandcode" | "doble".
import { DobleIA } from "./doble";
import type { InterpreteIA } from "./interfaz";
import { CommandCodeIA, configDesdeEntorno } from "./proveedores/commandcode";

export function crearInterprete(): InterpreteIA {
  const elegido = process.env.LLM_PROVEEDOR ?? (process.env.CMD_API_KEY ? "commandcode" : "doble");
  if (elegido === "doble") {
    if (process.env.NODE_ENV === "production") throw new Error("LLM_PROVEEDOR=doble no está permitido en producción");
    return new DobleIA();
  }
  if (elegido === "commandcode") return new CommandCodeIA(configDesdeEntorno());
  throw new Error(`LLM_PROVEEDOR desconocido: ${elegido}`);
}
