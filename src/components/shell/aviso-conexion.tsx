"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/** Estado "sin conexión" (UX §2): nada se marca como guardado sin confirmación del servidor. */
export function AvisoConexion() {
  const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine, () => true);
  if (enLinea) return null;
  return (
    <div role="alert" className="flex items-center justify-center gap-2 bg-ambar px-4 py-2 text-sm font-medium text-lamina">
      <WifiOff className="h-4 w-4" /> Sin conexión: los cambios no se guardaron. Se reintentará al volver la red.
    </div>
  );
}
