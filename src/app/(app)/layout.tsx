import Link from "next/link";
import { Plus } from "lucide-react";
import { AvisoConexion } from "@/components/shell/aviso-conexion";
import { BarraLateral, MenuMovil } from "@/components/shell/barra-lateral";
import { UsuarioActual } from "@/components/shell/usuario-actual";
import { Logo } from "@/components/ui/logo";
import { requerirSesion } from "@/domain/auth/servidor";
import { MARCA } from "@/lib/marca";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sesion = await requerirSesion();
  const pie = <UsuarioActual nombre={sesion.usuario.nombre} rol={sesion.usuario.rol} csrf={sesion.csrf} />;
  return (
    <div className="flex min-h-screen">
      <BarraLateral pie={pie} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AvisoConexion />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-linea bg-papel/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <MenuMovil pie={pie} />
          <Link href="/" className="text-tinta lg:hidden"><Logo className="h-8 w-auto" titulo={`${MARCA.nombre} · inicio`} /></Link>
          {process.env.NODE_ENV !== "production" && (
            <span className="hidden items-center gap-2 rounded-full border border-dashed border-ambar/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ambar md:inline-flex">
              Entorno de desarrollo
            </span>
          )}
          <Link
            href="/cotizaciones/nueva"
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-rauli px-3.5 text-sm font-medium text-lamina shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-rauli-hondo pointer-coarse:h-11"
          >
            <Plus className="h-4 w-4" /> Nueva cotización
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
