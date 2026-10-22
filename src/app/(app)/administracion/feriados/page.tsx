import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { feriadosDelAnio } from "@/domain/precios/calendario";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { cn, fecha } from "@/lib/formato";
import { NuevoFeriado, QuitarFeriado } from "./formulario-feriado";

export const metadata: Metadata = { title: "Feriados" };

const dia = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "UTC" });

export default async function FeriadosPage({ searchParams }: PageProps<"/administracion/feriados">) {
  const sesion = await requerirSesion();
  const actual = Number(hoySantiago().slice(0, 4));
  const pedido = Number((await searchParams).anio);
  const anio = pedido >= 2000 && pedido <= 2100 ? pedido : actual;
  const datos = await feriadosDelAnio(bd(), anio);
  const edita = sesion.permisos.has("config.editar");

  return (
    <>
      <Encabezado titulo="Feriados"
        descripcion="La vigencia de las cotizaciones se cuenta en días hábiles. Los feriados legales se calculan solos; los decretados por única vez (elecciones, leyes puntuales) se agregan aquí."
        acciones={edita && <NuevoFeriado csrf={sesion.csrf} />} />
      <nav aria-label="Año" className="mb-5 flex gap-1.5">
        {[anio - 1, anio, anio + 1].map((a) => (
          <Link key={a} href={`/administracion/feriados?anio=${a}`} aria-current={a === anio ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-sm pointer-coarse:py-2.5", a === anio ? "bg-tinta text-lamina" : "border border-linea text-tinta-suave hover:border-tinta")}>{a}</Link>
        ))}
      </nav>
      <Panel sinRelleno>
        <Tabla etiqueta="Feriados">
          <thead><tr><Th>Fecha</Th><Th>Día</Th><Th>Feriado</Th><Th>Origen</Th><Th><span className="sr-only">Acciones</span></Th></tr></thead>
          <tbody>
            {datos.map((f) => (
              <Tr key={f.fecha}>
                <Td className="whitespace-nowrap tabular-nums">{fecha(f.fecha)}</Td>
                <Td className="capitalize text-tinta-suave">{dia.format(new Date(`${f.fecha}T00:00:00Z`))}</Td>
                <Td>{f.nombre}</Td>
                <Td>{f.origen === "ley" ? <Etiqueta>Por ley</Etiqueta> : <Etiqueta tono="pizarra">Adicional</Etiqueta>}</Td>
                <Td>{edita && f.origen === "adicional" && <QuitarFeriado fecha={f.fecha} csrf={sesion.csrf} />}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      </Panel>
    </>
  );
}
