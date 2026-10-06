import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { BarraLateral } from "@/components/shell/barra-lateral";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-linea bg-papel/85 px-8 backdrop-blur">
          <label className="relative flex max-w-md flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-tinta-tenue" />
            <input
              type="search"
              placeholder="Buscar código, cliente o cotización…"
              className="h-9 w-full rounded-md border border-linea bg-lamina pl-9 pr-12 text-sm placeholder:text-tinta-tenue focus:border-tinta focus:outline-none"
            />
            <kbd className="absolute right-2.5 rounded border border-linea px-1.5 font-mono text-[10px] text-tinta-tenue">⌘K</kbd>
          </label>
          <span className="ml-auto hidden items-center gap-2 rounded-full border border-dashed border-ambar/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ambar md:inline-flex">
            Prototipo · datos ficticios
          </span>
          <Link
            href="/cotizaciones/nueva"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-rauli px-3.5 text-sm font-medium text-lamina shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-rauli-hondo"
          >
            <Plus className="h-4 w-4" /> Nueva cotización
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
