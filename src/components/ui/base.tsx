import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/formato";
import { maderas, type MaderaId } from "./maderas";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";

const variantes: Record<Variante, string> = {
  primario: "bg-rauli text-lamina hover:bg-rauli-hondo shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]",
  secundario: "bg-lamina text-tinta border border-linea-fuerte hover:border-tinta hover:bg-papel",
  fantasma: "text-tinta-suave hover:text-tinta hover:bg-papel-hundido",
  peligro: "bg-lamina text-error border border-error/40 hover:bg-error-velo",
};

const baseBoton =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-9 text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";

export function Boton({ variante = "secundario", className, ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={cn(baseBoton, variantes[variante], className)} {...p} />;
}

export function BotonLink({ variante = "secundario", className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={cn(baseBoton, variantes[variante], className)} {...p} />;
}

type Tono = "neutro" | "musgo" | "ambar" | "pizarra" | "rauli" | "error";
const tonos: Record<Tono, string> = {
  neutro: "bg-papel-hundido text-tinta-suave border-linea",
  musgo: "bg-musgo-velo text-musgo border-musgo/25",
  ambar: "bg-ambar-velo text-ambar border-ambar/30",
  pizarra: "bg-pizarra-velo text-pizarra border-pizarra/25",
  rauli: "bg-rauli-velo text-rauli-hondo border-rauli/25",
  error: "bg-error-velo text-error border-error/25",
};

export function Etiqueta({ tono = "neutro", children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tonos[tono], className)}>
      {children}
    </span>
  );
}

/** Código de artículo como placa grabada: el elemento tipográfico del catálogo. */
export function Placa({ codigo, className }: { codigo: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border border-linea-fuerte bg-lamina px-1.5 py-px font-mono text-[12px] font-medium tracking-wide text-tinta shadow-[0_1px_0_var(--linea)]",
        className,
      )}
    >
      {codigo}
    </span>
  );
}

export function Madera({ id, compacto }: { id: MaderaId; compacto?: boolean }) {
  const m = maderas[id];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-tinta-suave">
      <span aria-hidden className="swatch h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: m.css }} />
      {!compacto && m.nombre}
    </span>
  );
}

export function Encabezado({
  antetitulo, titulo, descripcion, acciones,
}: { antetitulo: string; titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="entrada max-w-3xl">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-rauli">{antetitulo}</p>
          <h1 className="font-display text-[2.6rem] leading-[1.02] font-medium tracking-[-0.02em] text-tinta [font-variation-settings:'SOFT'_60,'opsz'_96]">
            {titulo}
          </h1>
          {descripcion && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-tinta-suave">{descripcion}</p>}
        </div>
        {acciones && <div className="entrada entrada-2 flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      <div className="regla" aria-hidden />
    </header>
  );
}

export function Panel({ titulo, accion, children, className, sinRelleno }: {
  titulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; sinRelleno?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border border-linea bg-lamina shadow-[0_1px_0_var(--linea),0_12px_30px_-24px_rgb(30_40_30/0.35)]", className)}>
      {titulo && (
        <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3">
          <h2 className="font-display text-lg font-medium tracking-tight">{titulo}</h2>
          {accion}
        </div>
      )}
      <div className={sinRelleno ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Cifra({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; tono?: "rauli" | "ambar" }) {
  return (
    <div className="border-l-2 border-linea-fuerte pl-4">
      <p className="text-xs uppercase tracking-[0.12em] text-tinta-tenue">{etiqueta}</p>
      <p className={cn("mt-1 font-display text-4xl font-medium tabular-nums tracking-tight", tono === "rauli" && "text-rauli", tono === "ambar" && "text-ambar")}>
        {valor}
      </p>
      {nota && <p className="mt-1 text-sm text-tinta-suave">{nota}</p>}
    </div>
  );
}

export function Aviso({ tono = "ambar", titulo, children, accion }: { tono?: Tono; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div role="status" className={cn("flex items-start justify-between gap-4 rounded-md border px-4 py-3 text-sm", tonos[tono])}>
      <div>
        <p className="font-semibold">{titulo}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {accion}
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div aria-hidden className="regla w-24 opacity-70" />
      <p className="font-display text-xl">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-tinta-suave">{children}</p>}
      {accion}
    </div>
  );
}
