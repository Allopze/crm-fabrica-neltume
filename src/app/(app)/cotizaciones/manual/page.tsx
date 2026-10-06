import type { Metadata } from "next";
import { Plus, Trash2 } from "lucide-react";
import { Boton, Encabezado, Madera, Panel, Placa } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { articulos, maderas, recargos } from "@/mock/catalogo";
import { clientes } from "@/mock/comercial";
import { clp } from "@/lib/formato";

export const metadata: Metadata = { title: "Cotización manual" };

const lineas = [
  { codigo: "ANC-O-3-A", cantidad: 4 },
  { codigo: "MAR-O-2X4-B", cantidad: 4 },
];

const campo = "h-10 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

export default function ManualPage() {
  const filas = lineas.map((l) => {
    const a = articulos.find((x) => x.codigo === l.codigo)!;
    const unit = Math.round(a.precioNeto * (1 + recargos[a.tipo]));
    return { ...l, a, unit };
  });
  const neto = filas.reduce((s, f) => s + f.unit * f.cantidad, 0);

  return (
    <>
      <Encabezado
        antetitulo="Cotizador · sin IA"
        titulo="Cotización manual"
        descripcion="Mismo cálculo que la cotización desde texto: lista vigente, recargo por tipo y redondeo al peso."
      />

      <Panel titulo="Agregar artículo" className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_90px_auto]">
          <select className={campo} aria-label="Modelo" defaultValue="Neltume">
            {[...new Set(articulos.map((a) => a.modelo))].map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className={campo} aria-label="Madera">{Object.values(maderas).map((m) => <option key={m.nombre}>{m.nombre}</option>)}</select>
          <select className={campo} aria-label="Ancho"><option>0,90 a 0,95</option><option>0,80 a 0,85</option></select>
          <select className={campo} aria-label="Alto"><option>2,10 m</option><option>2,00 m</option></select>
          <input className={campo} type="number" min={1} defaultValue={1} aria-label="Cantidad" />
          <Boton variante="primario" className="h-10"><Plus className="h-4 w-4" /> Agregar</Boton>
        </div>
        <p className="mt-2 text-sm text-tinta-tenue">Código resultante: <Placa codigo="NEL-R-4-B" /> · disponible 2</p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel sinRelleno>
          <Tabla>
            <thead><tr><Th>Código</Th><Th>Madera</Th><Th>Tipo</Th><Th alinear="der">Cant.</Th><Th alinear="der">Unitario</Th><Th alinear="der">Total</Th><Th /></tr></thead>
            <tbody>
              {filas.map((f) => (
                <Tr key={f.codigo}>
                  <Td><Placa codigo={f.codigo} /> <span className="ml-2 text-tinta-suave">{f.a.modelo}</span></Td>
                  <Td><Madera id={f.a.madera} /></Td>
                  <Td className="text-tinta-suave">{f.a.tipo} · +{Math.round(recargos[f.a.tipo] * 100)} %</Td>
                  <Td alinear="der">{f.cantidad}</Td>
                  <Td alinear="der">{clp(f.unit)}</Td>
                  <Td alinear="der" className="font-medium">{clp(f.unit * f.cantidad)}</Td>
                  <Td><button aria-label="Quitar" className="text-tinta-tenue hover:text-error"><Trash2 className="h-4 w-4" /></button></Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        </Panel>

        <Panel titulo="Resumen">
          <label className="text-sm font-medium" htmlFor="cli">Cliente</label>
          <select id="cli" className={`${campo} mt-1.5 w-full`}>{clientes.map((c) => <option key={c.id}>{c.nombre}</option>)}</select>
          <dl className="mt-5 space-y-2 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-tinta-suave">Neto</dt><dd>{clp(neto)}</dd></div>
            <div className="flex justify-between"><dt className="text-tinta-suave">IVA 19 %</dt><dd>{clp(Math.round(neto * 0.19))}</dd></div>
            <div className="flex justify-between border-t border-linea pt-2 font-display text-2xl"><dt>Total</dt><dd>{clp(neto + Math.round(neto * 0.19))}</dd></div>
          </dl>
          <Boton variante="primario" className="mt-5 h-11 w-full">Guardar borrador</Boton>
        </Panel>
      </div>
    </>
  );
}
