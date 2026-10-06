import Link from "next/link";
import { ArrowRight, CircleHelp, Sparkles, TriangleAlert } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { articulos, disponible } from "@/mock/catalogo";
import { cotizaciones, nombreCliente, pedidos } from "@/mock/comercial";
import { materiasPrimas } from "@/mock/operacion";
import { requerirSesion } from "@/domain/auth/servidor";
import { clp, fechaHora, numero } from "@/lib/formato";

export default async function PanelPage() {
  const sesion = await requerirSesion();
  const nombre = sesion.usuario.nombre.split(/\s+/)[0];
  const hoy = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date());
  const bajoMinimo = articulos.filter((a) => disponible(a) < a.minimo);
  const mpBajas = materiasPrimas.filter((m) => m.existencia < m.minimo);
  const borradores = cotizaciones.filter((c) => c.estado === "borrador" || c.estado === "ia_fallida");
  const conFaltante = pedidos.filter((p) => p.items.some((i) => i.faltante > 0));

  return (
    <>
      <Encabezado
        antetitulo={hoy}
        titulo={<>Hola, {nombre}.</>}
        descripcion={
          <>
            Tienes <strong className="text-tinta">{borradores.length} cotizaciones</strong> por revisar y{" "}
            <strong className="text-tinta">{bajoMinimo.length + mpBajas.length} insumos o puertas</strong> bajo el mínimo.
          </>
        }
      />

      {/* Mesa de entrada: el gesto principal del sistema */}
      <Link
        href="/cotizaciones/nueva"
        className="entrada entrada-2 group relative mb-10 block overflow-hidden rounded-lg border border-linea-fuerte bg-lamina p-7 shadow-[0_18px_40px_-30px_rgb(30_40_30/0.5)] transition-colors hover:border-tinta"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-rauli">Mesa de entrada</p>
            <p className="mt-2 font-display text-[1.7rem] leading-tight font-medium tracking-tight">
              Pega el pedido tal como llegó.
            </p>
            <p className="mt-2 max-w-xl text-sm text-tinta-suave">
              La IA lo interpreta en segundos; los precios los calcula el sistema y tú apruebas antes de que salga.
            </p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rauli text-lamina transition-transform group-hover:translate-x-1">
            <ArrowRight className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-5 rounded-md border border-dashed border-linea-fuerte bg-papel px-4 py-3 font-mono text-[13px] text-tinta-tenue">
          «3 puertas Neltume en raulí de 90x210 y 2 Toltén de 87x215…»
        </p>
      </Link>

      <div className="entrada entrada-3 mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
        <Cifra etiqueta="Cotizaciones · octubre" valor="37" nota="+12 % vs. septiembre" />
        <Cifra etiqueta="Tiempo a PDF" valor="2:48" nota="minutos, mediana · meta ≤ 3:00" tono="rauli" />
        <Cifra etiqueta="Ítems por confirmar" valor="4" nota="en 2 borradores" tono="ambar" />
        <Cifra etiqueta="Por cobrar en pedidos" valor={clp(3120600)} nota="1 pedido en producción" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
        <Panel titulo="Para revisar" accion={<Link href="/cotizaciones" className="text-sm text-rauli hover:underline">Ver todas</Link>} sinRelleno>
          <ul>
            {borradores.map((c) => (
              <li key={c.id} className="border-b border-linea/70 last:border-0">
                <Link href={c.estado === "ia_fallida" ? "/cotizaciones/nueva" : `/cotizaciones/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-papel/70">
                  <span className="font-mono text-sm text-tinta-tenue">#{c.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nombreCliente(c.clienteId)}</span>
                    <span className="block truncate text-sm text-tinta-tenue">{fechaHora(c.creada)} · {c.origen === "ia" ? "desde texto" : "manual"}</span>
                  </span>
                  {c.estado === "ia_fallida" ? (
                    <Etiqueta tono="error"><TriangleAlert className="h-3 w-3" /> IA no disponible</Etiqueta>
                  ) : (
                    <Etiqueta tono="ambar"><CircleHelp className="h-3 w-3" /> 2 por confirmar</Etiqueta>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-8">
          <Panel titulo="Bajo el mínimo" accion={<Link href="/stock" className="text-sm text-rauli hover:underline">Stock</Link>} sinRelleno>
            <ul className="divide-y divide-linea/70">
              {bajoMinimo.slice(0, 4).map((a) => (
                <li key={a.codigo} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-3"><Placa codigo={a.codigo} /><span className="text-sm text-tinta-suave">{a.modelo}</span></span>
                  <span className="text-sm tabular-nums"><strong>{disponible(a)}</strong><span className="text-tinta-tenue"> / mín. {a.minimo}</span></span>
                </li>
              ))}
              {mpBajas.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="truncate text-sm">{m.nombre}</span>
                  <span className="text-sm tabular-nums"><strong className="text-ambar">{numero(m.existencia)}</strong><span className="text-tinta-tenue"> / {numero(m.minimo)} {m.unidad}</span></span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel titulo="Pedidos con faltante">
            {conFaltante.map((p) => (
              <Link key={p.id} href={`/pedidos/${p.id}`} className="flex items-center justify-between gap-3 hover:text-rauli">
                <span>
                  <span className="font-medium">Pedido {p.numero}</span>
                  <span className="block text-sm text-tinta-tenue">{nombreCliente(p.clienteId)}</span>
                </span>
                <Etiqueta tono="pizarra"><Sparkles className="h-3 w-3" /> faltan {p.items.reduce((s, i) => s + i.faltante, 0)} por fabricar</Etiqueta>
              </Link>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
