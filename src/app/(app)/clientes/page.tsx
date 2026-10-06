import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
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
  const { datos, siguiente } = await buscarClientes(bd(), { q, cursor });

  return (
    <>
      <Encabezado
        antetitulo="Ventas · clientes"
        titulo="Clientes"
        descripcion="Solo los datos necesarios para cotizar y despachar. Son datos personales: nunca se envían a la IA."
        acciones={sesion.permisos.has("clientes.editar") && <NuevoCliente csrf={sesion.csrf} />}
      />
      <form className="mb-5"><input type="search" name="q" defaultValue={q} aria-label="Buscar cliente" placeholder="Nombre, RUT o comuna"
        className="h-9 w-72 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none" /></form>
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={q ? "Sin resultados" : "Aún no hay clientes"}>{q ? `Nada coincide con «${q}».` : "Crea el primero con «Nuevo cliente»."}</Vacio>
        ) : (
          <Tabla>
            <thead><tr><Th>Nombre</Th><Th>RUT</Th><Th>Tipo</Th><Th>Comuna</Th><Th>Contacto</Th></tr></thead>
            <tbody>
              {datos.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.nombre}</Td>
                  <Td className="font-mono text-sm">{formatearRut(c.rut)}</Td>
                  <Td><Etiqueta tono={c.tipo === "tienda" ? "rauli" : "neutro"}>{c.tipo === "tienda" ? "Tienda" : "Directo"}</Etiqueta></Td>
                  <Td className="text-tinta-suave">{c.comuna ?? "—"}</Td>
                  <Td className="text-tinta-suave">{c.contacto ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && <p className="mt-4 text-sm"><Link className="text-rauli hover:underline" href={`/clientes?${new URLSearchParams({ ...(q ? { q } : {}), desde: siguiente })}`}>Ver más →</Link></p>}
      <p className="mt-4 flex items-center gap-2 text-sm text-tinta-tenue"><ShieldCheck className="h-4 w-4 text-musgo" /> RUT validado con dígito verificador. Acceso con el permiso clientes.ver.</p>
    </>
  );
}
