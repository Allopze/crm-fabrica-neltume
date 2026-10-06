import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/formato";

export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, alinear, ...p }: ComponentProps<"th"> & { alinear?: "der" }) {
  return (
    <th
      className={cn(
        "border-b border-linea-fuerte px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta-tenue",
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
