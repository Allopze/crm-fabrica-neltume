import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { auditoria } from "@/mock/operacion";
import { fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Auditoría" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const tono = { ok: "musgo", denegado: "error", error: "ambar" } as const;

export default function AuditoriaPage() {
  return (
    <>
      <Encabezado
        antetitulo="Configuración · trazabilidad"
        titulo="Auditoría"
        descripcion="Quién hizo qué, cuándo y con qué resultado, incluidos los intentos denegados. El registro no se puede editar ni borrar."
        acciones={<span className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue"><Lock className="h-4 w-4" /> solo lectura · retención 6 años</span>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <select className={campo} aria-label="Actor"><option>Todos los actores</option><option>Paula R.</option><option>visitante</option></select>
        <select className={campo} aria-label="Recurso"><option>Todos los recursos</option><option>Cotización</option><option>Stock</option><option>Precios</option></select>
        <select className={campo} aria-label="Resultado"><option>Todo resultado</option><option>ok</option><option>denegado</option></select>
        <input type="date" className={campo} aria-label="Desde" defaultValue="2026-09-29" />
        <input type="date" className={campo} aria-label="Hasta" defaultValue="2026-10-05" />
      </div>
      <Panel sinRelleno>
        <Tabla>
          <thead><tr><Th>Fecha</Th><Th>Actor</Th><Th>Acción</Th><Th>Recurso</Th><Th>Resultado</Th><Th>Detalle</Th></tr></thead>
          <tbody>
            {auditoria.map((e) => (
              <Tr key={e.fecha}>
                <Td className="whitespace-nowrap font-mono text-xs text-tinta-suave">{fechaHora(e.fecha)}</Td>
                <Td>{e.actor}</Td>
                <Td className="font-medium">{e.accion}</Td>
                <Td className="text-tinta-suave">{e.recurso}</Td>
                <Td><Etiqueta tono={tono[e.resultado]}>{e.resultado}</Etiqueta></Td>
                <Td className="max-w-sm text-sm text-tinta-suave">{e.detalle}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      </Panel>
    </>
  );
}
