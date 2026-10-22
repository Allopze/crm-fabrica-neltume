// REQ-COT-2.17, ADR-0015: fijar el mínimo solo cuando la API del proveedor lo admite.
import type { ProveedorConfigurado } from "./ajustes";

export interface PerfilRazonamiento {
  modeloEfectivo: string;
  modo: string;
  parametros: { reasoning_effort?: "none" | "low" };
}

/** Un modelo sin control verificado sigue disponible con la configuración del proveedor. */
export function perfilRazonamiento(proveedor: ProveedorConfigurado, modelo: string): PerfilRazonamiento {
  const id = modelo.toLowerCase();
  // Verificado con Provider API + x-cmd-zdr: none/minimal son rechazados; low es el mínimo aceptado.
  if (proveedor === "commandcode" && id === "gpt-6-luna") {
    return { modeloEfectivo: modelo, modo: "Esfuerzo mínimo (low)", parametros: { reasoning_effort: "low" } };
  }
  return { modeloEfectivo: modelo, modo: "Esfuerzo predeterminado del proveedor", parametros: {} };
}
