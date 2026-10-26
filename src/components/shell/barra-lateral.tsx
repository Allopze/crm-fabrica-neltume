"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cable, ClipboardList, FileText, Gauge, Hammer, Layers, LayoutDashboard, Menu, Package, ScrollText, Settings2, Shield, Tag, Users, X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import type { Permiso } from "@/domain/auth/permisos";
import { cn } from "@/lib/formato";
import { MARCA } from "@/lib/marca";

type ItemNavegacion = { href: string; texto: string; icono: LucideIcon; permiso?: Permiso };

const grupos: { nombre: string; items: ItemNavegacion[] }[] = [
  {
    nombre: "Ventas",
    items: [
      { href: "/", texto: "Panel", icono: LayoutDashboard },
      { href: "/cotizaciones", texto: "Cotizaciones", icono: FileText, permiso: "cotizaciones.crear" },
      { href: "/pedidos", texto: "Notas de pedido", icono: ClipboardList, permiso: "pedidos.gestionar" },
      { href: "/clientes", texto: "Clientes", icono: Users, permiso: "clientes.ver" },
    ],
  },
  {
    nombre: "Taller",
    items: [
      { href: "/stock", texto: "Stock de puertas", icono: Package, permiso: "stock.ver" },
      { href: "/materias-primas", texto: "Materias primas", icono: Layers, permiso: "stock.ver" },
      { href: "/produccion", texto: "Producción y BOM", icono: Hammer, permiso: "stock.ver" },
    ],
  },
  {
    nombre: "Configuración",
    items: [
      { href: "/precios", texto: "Lista de precios", icono: Tag, permiso: "stock.ver" },
      { href: "/administracion", texto: "Usuarios y permisos", icono: Shield, permiso: "usuarios.gestionar" },
      { href: "/administracion/auditoria", texto: "Auditoría", icono: ScrollText, permiso: "auditoria.ver" },
      { href: "/administracion/metricas", texto: "Métricas de IA", icono: Gauge, permiso: "auditoria.ver" },
      { href: "/administracion/ia", texto: "Ajustes de IA", icono: Settings2, permiso: "config.editar" },
      { href: "/administracion/tienda", texto: "Conexión con la tienda", icono: Cable, permiso: "config.editar" },
    ],
  },
];

/** La navegación solo muestra lo que la sesión puede abrir (UX §2); el backend sigue denegando por su cuenta. */
function visibles(permisos: ReadonlySet<string>) {
  return grupos
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.permiso || permisos.has(i.permiso)) }))
    .filter((g) => g.items.length > 0);
}

function Contenido({ pie, ruta, permisos }: { pie: ReactNode; ruta: string; permisos: ReadonlySet<string> }) {
  const activo = (href: string) =>
    href === "/" ? ruta === "/" : ruta === href || (ruta.startsWith(href + "/") && !(href === "/administracion" && /^\/administracion\/(auditoria|metricas|ia|tienda)/.test(ruta)));

  return (
    <>
      <Link href="/" className="flex items-end gap-3 px-6 pt-7 pb-8 text-bosque-tinta">
        <Logo className="h-16 w-auto" titulo={`${MARCA.nombre} · inicio`} />
        <span className="pb-1 text-[11px] font-medium uppercase leading-tight tracking-[0.16em] text-bosque-tinta/70">{MARCA.area}</span>
      </Link>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3" aria-label="Principal">
        {visibles(permisos).map((g) => (
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
export function BarraLateral({ pie, permisos }: { pie: ReactNode; permisos: readonly string[] }) {
  const ruta = usePathname();
  return (
    <aside aria-label="Navegación" className="veta sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col text-bosque-tinta lg:flex">
      <Contenido pie={pie} ruta={ruta} permisos={new Set(permisos)} />
    </aside>
  );
}

export function MenuMovil({ pie, permisos }: { pie: ReactNode; permisos: readonly string[] }) {
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
    const principal = document.getElementById("contenido");
    principal?.setAttribute("inert", "");
    const alTeclear = (e: KeyboardEvent) => {
      // El diálogo de contraseña tiene su propio foco y su propio Escape.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); return; }
      if (e.key !== "Tab") return;
      // El cajón se declara modal: el foco no puede escaparse al contenido de atrás.
      const enfocables = cajon.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!enfocables?.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
      principal?.removeAttribute("inert");
    };
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
            <Contenido pie={pie} ruta={ruta} permisos={new Set(permisos)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
