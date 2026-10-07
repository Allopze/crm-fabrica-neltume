"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, ClipboardList, FileText, Gauge, Hammer, Layers, LayoutDashboard, Menu, Package, ScrollText, Settings2, Shield, Tag, Users, X,
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
      { href: "/administracion/ia", texto: "Ajustes de IA", icono: Settings2 },
      { href: "/administracion/feriados", texto: "Feriados", icono: CalendarDays },
    ],
  },
];

function Contenido({ pie, ruta }: { pie: ReactNode; ruta: string }) {
  const activo = (href: string) =>
    href === "/" ? ruta === "/" : ruta === href || (ruta.startsWith(href + "/") && !(href === "/administracion" && /^\/administracion\/(auditoria|metricas|ia|feriados)/.test(ruta)));

  return (
    <>
      <Link href="/" className="flex items-end gap-3 px-6 pt-7 pb-8 text-bosque-tinta">
        <Logo className="h-16 w-auto" titulo={`${MARCA.nombre} · inicio`} />
        <span className="pb-1 text-[11px] font-medium uppercase leading-tight tracking-[0.16em] text-bosque-tinta/70">{MARCA.area}</span>
      </Link>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3" aria-label="Principal">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-bosque-tinta/65">{g.nombre}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ href, texto, icono: Icono }) => {
                const on = activo(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors pointer-coarse:py-3",
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
    </>
  );
}

/** Barra lateral fija desde lg; bajo ese ancho, cajón que abre el botón de menú del encabezado (REQ-NFR-6). */
export function BarraLateral({ pie }: { pie: ReactNode }) {
  const ruta = usePathname();
  return (
    <aside aria-label="Navegación" className="veta sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col text-bosque-tinta lg:flex">
      <Contenido pie={pie} ruta={ruta} />
    </aside>
  );
}

export function MenuMovil({ pie }: { pie: ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(ruta);
  const boton = useRef<HTMLButtonElement>(null);
  const cajon = useRef<HTMLDivElement>(null);

  // Al navegar se cierra el cajón.
  if (abierto && ruta !== rutaAbierta) {
    setAbierto(false);
  }

  useEffect(() => {
    if (!abierto) return;
    (cajon.current?.querySelector<HTMLElement>("a[aria-current=page]") ?? cajon.current?.querySelector<HTMLElement>("nav a"))?.focus();
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", alTeclear); document.body.style.overflow = ""; };
  }, [abierto]);

  return (
    <>
      <button ref={boton} type="button" aria-label="Abrir menú" aria-expanded={abierto} aria-controls="menu-movil"
        onClick={() => { setRutaAbierta(ruta); setAbierto(true); }}
        className="-ml-2 grid h-11 w-11 place-items-center rounded-md text-tinta hover:bg-papel-hundido lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      {/* En un portal: el backdrop-blur del encabezado haría de contenedor de los fixed y encerraría el cajón. */}
      {abierto && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <div aria-hidden className="absolute inset-0 bg-bosque/50" onClick={() => setAbierto(false)} />
          <div ref={cajon} id="menu-movil" role="dialog" aria-modal="true" aria-label="Menú"
            className="veta absolute inset-y-0 left-0 flex w-[min(288px,85vw)] flex-col text-bosque-tinta shadow-[8px_0_30px_-12px_rgb(0_0_0/0.5)]">
            <button type="button" aria-label="Cerrar menú" onClick={() => { setAbierto(false); boton.current?.focus(); }}
              className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-md text-bosque-tinta/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Contenido pie={pie} ruta={ruta} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
