import type { Metadata } from "next";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { recargos, type TipoPuerta } from "@/mock/catalogo";
import { listas } from "@/mock/operacion";
import { fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Lista de precios" };

const informe = [
  { fila: 1204, motivo: "El código ANC-O-6-B no coincide con modelo, madera y medida de la fila" },
  { fila: 5532, motivo: "Precio neto vacío" },
];

export default function PreciosPage() {
  return (
    <>
      <Encabezado
        antetitulo="Configuración · precios"
        titulo="Lista de precios"
        descripcion="Cada cambio crea una versión nueva. Las cotizaciones aprobadas conservan el precio de la versión con que se emitieron."
        acciones={<Boton variante="primario"><Upload className="h-4 w-4" /> Re-importar Excel</Boton>}
      />

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel titulo="Versiones" sinRelleno>
          <ol className="relative">
            {listas.map((l) => (
              <li key={l.version} className="flex gap-4 border-b border-linea/70 px-5 py-4 last:border-0">
                <span className={l.vigente
                  ? "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rauli font-display text-lg text-lamina"
                  : "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-linea-fuerte font-display text-lg text-tinta-suave"}>
                  v{l.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.cambios}</p>
                  <p className="text-sm text-tinta-tenue">{l.origen} · {l.autor} · {fechaHora(l.fecha)}</p>
                </div>
                {l.vigente && <Etiqueta tono="rauli">vigente</Etiqueta>}
              </li>
            ))}
          </ol>
        </Panel>

        <div className="space-y-8">
          <Panel titulo="Recargo por tipo de puerta" accion={<Boton className="h-8">Editar</Boton>}>
            <ul className="space-y-3">
              {(Object.keys(recargos) as TipoPuerta[]).map((t) => (
                <li key={t} className="flex items-center gap-4">
                  <span className="w-20 text-sm">{t}</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-papel-hundido">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-rauli" style={{ width: `${recargos[t] * 250}%` }} />
                  </span>
                  <span className="w-12 text-right font-mono text-sm tabular-nums">{Math.round(recargos[t] * 100)} %</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-tinta-tenue">Valores ficticios del prototipo. Se aplican sobre el precio neto de lista.</p>
          </Panel>

          <Panel titulo="Última importación" accion={<Etiqueta tono="musgo">v2 · 15-09-2026</Etiqueta>}>
            <div className="flex items-center gap-3 text-sm">
              <FileSpreadsheet className="h-8 w-8 text-musgo" strokeWidth={1.4} />
              <div>
                <p className="font-medium">COTIZADOR_2026.xlsx</p>
                <p className="text-tinta-tenue">hojas Precio y Categorias</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-musgo-velo py-2"><dt className="text-[11px] uppercase tracking-wider text-musgo">Creadas</dt><dd className="font-display text-xl">0</dd></div>
              <div className="rounded-md bg-pizarra-velo py-2"><dt className="text-[11px] uppercase tracking-wider text-pizarra">Cambiadas</dt><dd className="font-display text-xl">214</dd></div>
              <div className="rounded-md bg-error-velo py-2"><dt className="text-[11px] uppercase tracking-wider text-error">Rechazadas</dt><dd className="font-display text-xl">2</dd></div>
            </dl>
            <Tabla className="mt-4">
              <thead><tr><Th>Fila</Th><Th>Motivo del rechazo</Th></tr></thead>
              <tbody>{informe.map((r) => <Tr key={r.fila}><Td className="font-mono">{r.fila}</Td><Td className="text-tinta-suave">{r.motivo}</Td></Tr>)}</tbody>
            </Tabla>
          </Panel>
        </div>
      </div>
    </>
  );
}
