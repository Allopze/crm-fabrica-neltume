import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/formato";

/** Contenedor con scroll horizontal: enfocable para recorrerlo con el teclado (WCAG 2.1.1). */
export function Tabla({ children, className, etiqueta = "Tabla de datos" }: { children: ReactNode; className?: string; etiqueta?: string }) {
  return (
    <div role="region" aria-label={etiqueta} tabIndex={0} className={cn("relative overflow-x-auto focus-visible:outline-offset-[-2px]", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, alinear, ...p }: ComponentProps<"th"> & { alinear?: "der" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-linea-fuerte px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-tinta-tenue",
        alinear === "der" && "text-right",
        className,
      )}
      {...p}
    />
  );
}

export function Tr({ className, ...p }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-linea/70 transition-colors last:border-0 hover:bg-papel/70", className)} {...p} />;
}

export function Td({ className, alinear, ...p }: ComponentProps<"td"> & { alinear?: "der" }) {
  return <td className={cn("px-4 py-3 align-middle", alinear === "der" && "text-right tabular-nums", className)} {...p} />;
}
