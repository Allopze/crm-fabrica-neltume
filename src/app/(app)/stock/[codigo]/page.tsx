import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Madera, Panel, Placa } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { buscarArticulo, disponible, maderas, recargos } from "@/mock/catalogo";
import { movimientosDemo } from "@/mock/operacion";
import { clp, cn, fechaHora, metros } from "@/lib/formato";

export const metadata: Metadata = { title: "Artículo" };

export default async function ArticuloPage({ params }: PageProps<"/stock/[codigo]">) {
  const { codigo } = await params;
  const a = buscarArticulo(decodeURIComponent(codigo));
  if (!a) notFound();
  const unit = Math.round(a.precioNeto * (1 + recargos[a.tipo]));

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/stock" className="hover:text-tinta">Stock de puertas</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-tinta">{a.codigo}</span>
      </nav>
      <Encabezado
        antetitulo={`${a.tipo} · ${maderas[a.madera].nombre}`}
        titulo={<>{a.modelo} <span className="text-tinta-tenue">{a.ancho} × {metros(a.alto)} m</span></>}
        acciones={<Placa codigo={a.codigo} className="px-3 py-1 text-base" />}
      />

      <div className="mb-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
        <Cifra etiqueta="Existencia" valor={a.existencia} />
        <Cifra etiqueta="Reservado" valor={a.reservado} nota="en notas de pedido" />
        <Cifra etiqueta="Disponible" valor={disponible(a)} tono={disponible(a) < a.minimo ? "ambar" : undefined} nota={`mínimo ${a.minimo}`} />
        <Cifra etiqueta="Precio de venta" valor={clp(unit)} nota={`neto · recargo ${Math.round(recargos[a.tipo] * 100)} %`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Movimientos" accion={<span className="inline-flex items-center gap-1 text-xs text-tinta-tenue"><Lock className="h-3 w-3" /> inmutables</span>} sinRelleno>
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Referencia</Th><Th>Usuario</Th><Th alinear="der">Cantidad</Th></tr></thead>
            <tbody>
              {movimientosDemo.map((m) => (
                <Tr key={m.fecha}>
                  <Td className="whitespace-nowrap text-tinta-suave">{fechaHora(m.fecha)}</Td>
                  <Td>{m.tipo}{m.motivo && <span className="block text-xs text-tinta-tenue">Motivo: {m.motivo}</span>}</Td>
                  <Td className="text-tinta-suave">{m.ref}</Td>
                  <Td className="text-tinta-suave">{m.usuario}</Td>
                  <Td alinear="der" className={cn("font-mono font-semibold", m.cantidad < 0 ? "text-error" : "text-musgo")}>
                    {m.cantidad > 0 ? "+" : "−"}{Math.abs(m.cantidad)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        </Panel>

        <div className="space-y-6">
          <Panel titulo="Ficha">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-tinta-suave">Madera</dt><dd><Madera id={a.madera} /></dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Rango de ancho</dt><dd>{a.ancho} m</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Alto</dt><dd>{metros(a.alto)} m</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Tipo</dt><dd>{a.tipo}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Mínimo</dt><dd>{a.minimo} <button className="ml-1 text-rauli hover:underline">editar</button></dd></div>
            </dl>
          </Panel>
          <Panel titulo="Costos y margen" accion={<Etiqueta tono="rauli">solo con permiso costos.ver</Etiqueta>}>
            <p className="text-sm text-tinta-suave">Producción, materiales, insumos y gastos generales de la lista v3. En el prototipo los costos no se muestran.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
