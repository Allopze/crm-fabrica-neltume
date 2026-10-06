"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, ClipboardList, FileText, Gauge, Hammer, Layers, LayoutDashboard, Package, ScrollText, Shield, Tag, Users,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/formato";
import { MARCA } from "@/lib/marca";

const grupos = [
  {
    nombre: "Ventas",
    items: [
      { href: "/", texto: "Panel", icono: LayoutDashboard },
      { href: "/cotizaciones", texto: "Cotizaciones", icono: FileText },
      { href: "/pedidos", texto: "Notas de pedido", icono: ClipboardList },
      { href: "/clientes", texto: "Clientes", icono: Users },
    ],
  },
  {
    nombre: "Taller",
    items: [
      { href: "/stock", texto: "Stock de puertas", icono: Package },
      { href: "/materias-primas", texto: "Materias primas", icono: Layers },
      { href: "/produccion", texto: "Producción y BOM", icono: Hammer },
    ],
  },
  {
    nombre: "Configuración",
    items: [
      { href: "/precios", texto: "Lista de precios", icono: Tag },
      { href: "/administracion", texto: "Usuarios y permisos", icono: Shield },
      { href: "/administracion/auditoria", texto: "Auditoría", icono: ScrollText },
      { href: "/administracion/metricas", texto: "Métricas de IA", icono: Gauge },
      { href: "/administracion/feriados", texto: "Feriados", icono: CalendarDays },
    ],
  },
];

export function BarraLateral({ pie }: { pie: ReactNode }) {
  const ruta = usePathname();
  const activo = (href: string) =>
    href === "/" ? ruta === "/" : ruta === href || (ruta.startsWith(href + "/") && !(href === "/administracion" && /^\/administracion\/(auditoria|metricas|feriados)/.test(ruta)));

  return (
    <aside className="veta sticky top-0 flex h-screen w-[248px] shrink-0 flex-col text-bosque-tinta">
      <Link href="/" className="flex items-end gap-3 px-6 pt-7 pb-8 text-bosque-tinta">
        <Logo className="h-16 w-auto" titulo={`${MARCA.nombre} · inicio`} />
        <span className="pb-1 font-mono text-[10px] uppercase leading-tight tracking-[0.22em] text-bosque-tinta/55">{MARCA.area}</span>
      </Link>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3" aria-label="Principal">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bosque-tinta/40">{g.nombre}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ href, texto, icono: Icono }) => {
                const on = activo(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors",
                        on ? "bg-white/[0.07] text-white" : "text-bosque-tinta/70 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-opacity", on ? "opacity-100" : "opacity-0")}
                        style={{ backgroundColor: "var(--pino-oregon)" }}
                      />
                      <Icono className="h-[17px] w-[17px] shrink-0 opacity-80" strokeWidth={1.6} />
                      {texto}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {pie}
    </aside>
  );
}
