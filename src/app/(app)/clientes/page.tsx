import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { FilaEnlazada } from "@/components/ui/fila-enlazada";
import { Filtros } from "@/components/ui/filtros";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { buscarClientes } from "@/domain/clientes";
import { formatearRut } from "@/domain/rut";
import { NuevoCliente } from "./nuevo-cliente";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("clientes.ver")) return <SinPermiso permiso="clientes.ver" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q ? sp.q : undefined;
  const cursor = typeof sp.desde === "string" ? sp.desde : undefined;
  const { datos, total, siguiente } = await buscarClientes(bd(), { q, cursor });

  return (
    <>
      <Encabezado
        titulo="Clientes"
        descripcion="Solo los datos necesarios para cotizar y despachar. Son datos personales: nunca se envían a la IA."
        acciones={sesion.permisos.has("clientes.editar") && <NuevoCliente csrf={sesion.csrf} rutInicial={typeof sp.nuevo === "string" ? sp.nuevo : undefined} />}
      />
      <Filtros etiqueta="Buscar clientes">
        <input type="search" name="q" defaultValue={q} aria-label="Buscar cliente" placeholder="Nombre, RUT o comuna" className={`${campo} w-full sm:w-72`} />
        {q && <Link href="/clientes" className="text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </Filtros>
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={q ? "Sin resultados" : "Aún no hay clientes"}>{q ? `Nada coincide con «${q}».` : "Crea el primero con «Nuevo cliente»."}</Vacio>
        ) : (
          <Tabla etiqueta="Clientes">
            <thead><tr><Th>Nombre</Th><Th>RUT</Th><Th>Tipo</Th><Th>Comuna</Th><Th>Contacto</Th></tr></thead>
            <tbody>
              {datos.map((c) => (
                <FilaEnlazada key={c.id} href={`/clientes/${c.id}`}>
                  <Td className="font-medium"><Link href={`/clientes/${c.id}`} className="text-rauli hover:underline">{c.nombre}</Link></Td>
                  <Td className="whitespace-nowrap font-mono text-sm">{formatearRut(c.rut)}</Td>
                  <Td><Etiqueta tono={c.tipo === "tienda" ? "rauli" : "neutro"}>{c.tipo === "tienda" ? "Tienda" : "Directo"}</Etiqueta></Td>
                  <Td className="text-tinta-suave">{c.comuna ?? "—"}</Td>
                  <Td className="text-tinta-suave">{c.contacto ?? "—"}</Td>
                </FilaEnlazada>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={total} singular="cliente" plural="clientes"
        inicio={cursor ? `/clientes${q ? `?${new URLSearchParams({ q })}` : ""}` : undefined}
        siguiente={siguiente ? `/clientes?${new URLSearchParams({ ...(q ? { q } : {}), desde: siguiente })}` : null} />
      <p className="mt-4 flex items-center gap-2 text-sm text-tinta-tenue"><ShieldCheck className="h-4 w-4 text-musgo" /> RUT validado con dígito verificador. Son datos personales: solo los ve quien tiene permiso para ver clientes.</p>
    </>
  );
}
