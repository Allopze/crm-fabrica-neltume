import type { Metadata } from "next";
import { Plus, ShieldCheck } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { clientes } from "@/mock/comercial";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <>
      <Encabezado
        antetitulo="Ventas · clientes"
        titulo="Clientes"
        descripcion="Solo los datos necesarios para cotizar y despachar. Son datos personales: nunca se envían a la IA."
        acciones={<Boton variante="primario"><Plus className="h-4 w-4" /> Nuevo cliente</Boton>}
      />
      <Panel sinRelleno>
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>RUT</Th><Th>Tipo</Th><Th>Comuna</Th><Th>Contacto</Th><Th alinear="der">Cotizaciones</Th></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.nombre}</Td>
                <Td className="font-mono text-sm">{c.rut}</Td>
                <Td><Etiqueta tono={c.tipo === "Tienda" ? "rauli" : "neutro"}>{c.tipo}</Etiqueta></Td>
                <Td className="text-tinta-suave">{c.comuna}</Td>
                <Td className="text-tinta-suave">{c.contacto}</Td>
                <Td alinear="der">{c.cotizaciones}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      </Panel>
      <p className="mt-4 flex items-center gap-2 text-sm text-tinta-tenue"><ShieldCheck className="h-4 w-4 text-musgo" /> RUT validado con dígito verificador. Acceso con el permiso clientes.ver.</p>
    </>
  );
}
