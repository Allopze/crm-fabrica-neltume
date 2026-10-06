import { Lock } from "lucide-react";
import { BotonLink } from "@/components/ui/base";

/** Estado "sin permiso" (UX §2). El backend igual rechaza la acción si se intenta por URL o API. */
export function SinPermiso({ permiso }: { permiso: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <Lock className="h-8 w-8 text-tinta-tenue" strokeWidth={1.4} />
      <p className="font-display text-2xl">No tienes permiso para esta sección</p>
      <p className="max-w-sm text-sm text-tinta-suave">
        Se requiere el permiso <code className="font-mono text-xs">{permiso}</code>. Pídelo a quien administra los usuarios.
      </p>
      <BotonLink href="/">Volver al panel</BotonLink>
    </div>
  );
}
