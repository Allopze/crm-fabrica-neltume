import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { clientes } from "@/mock/comercial";
import { clp } from "@/lib/formato";

export const metadata: Metadata = { title: "Documento de cotización" };

const lineas = [
  { codigo: "NEL-R-4-B", desc: "Puerta Neltume · Raulí · 0,90 a 0,95 × 2,10 m", cant: 3, unit: 277760 },
  { codigo: "A pedido", desc: "Puerta Toltén · Raulí · 0,87 × 2,15 m (medida especial)", cant: 2, unit: 405600 },
];

export default async function DocumentoPage({ params }: PageProps<"/cotizaciones/[id]/documento">) {
  const { id } = await params;
  const cliente = clientes[1];
  const neto = lineas.reduce((s, l) => s + l.cant * l.unit, 0);
  const iva = Math.round(neto * 0.19);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/cotizaciones/${id}`} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ChevronLeft className="h-4 w-4" /> Volver a la revisión
        </Link>
        <div className="flex gap-2">
          <Boton><Printer className="h-4 w-4" /> Imprimir</Boton>
          <Boton variante="primario"><Download className="h-4 w-4" /> Descargar PDF</Boton>
        </div>
      </div>

      {/* Hoja A4 */}
      <article className="entrada mx-auto aspect-[210/297] w-full max-w-[820px] bg-white px-[7%] py-[6%] text-[13px] text-[#222] shadow-[0_1px_0_var(--linea),0_30px_60px_-30px_rgb(30_40_30/0.45)]">
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 28 40" className="h-12 w-[34px] text-[#1d2920]" aria-hidden>
              <rect x="1" y="1" width="26" height="38" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <rect x="5" y="5" width="18" height="13" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="5" y="21" width="18" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="22.5" cy="20" r="1.3" fill="#9a4524" />
            </svg>
            <div>
              <p className="font-display text-2xl font-medium leading-none">Neltume</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[#666]">Fábrica de puertas · Neltume.co@gmail.com</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xl">Cotización N.º 124</p>
            <p className="mt-1 text-[#666]">Fecha 05-10-2026 · Válida hasta 19-10-2026</p>
          </div>
        </header>

        <div className="regla mt-6 mb-6" aria-hidden />

        <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          <div className="flex gap-2"><dt className="w-20 text-[#777]">Cliente</dt><dd className="font-medium">{cliente.nombre}</dd></div>
          <div className="flex gap-2"><dt className="w-20 text-[#777]">RUT</dt><dd>{cliente.rut}</dd></div>
          <div className="flex gap-2"><dt className="w-20 text-[#777]">Contacto</dt><dd>{cliente.contacto}</dd></div>
          <div className="flex gap-2"><dt className="w-20 text-[#777]">Comuna</dt><dd>{cliente.comuna}</dd></div>
        </dl>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-y border-[#222] text-left text-[10px] uppercase tracking-[0.12em]">
              <th className="py-2">Código</th><th className="py-2">Descripción</th>
              <th className="py-2 text-right">Cant.</th><th className="py-2 text-right">Precio unit.</th><th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.desc} className="border-b border-[#ddd]">
                <td className="py-2.5 font-mono text-[11px]">{l.codigo}</td>
                <td className="py-2.5">{l.desc}</td>
                <td className="py-2.5 text-right tabular-nums">{l.cant}</td>
                <td className="py-2.5 text-right tabular-nums">{clp(l.unit)}</td>
                <td className="py-2.5 text-right tabular-nums">{clp(l.cant * l.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-64 space-y-1.5 tabular-nums">
          <div className="flex justify-between"><span className="text-[#777]">Subtotal neto</span><span>{clp(neto)}</span></div>
          <div className="flex justify-between"><span className="text-[#777]">IVA 19 %</span><span>{clp(iva)}</span></div>
          <div className="flex justify-between border-t border-[#222] pt-2 font-display text-lg"><span>Total</span><span>{clp(neto + iva)}</span></div>
        </div>

        <footer className="mt-12 border-t border-[#ddd] pt-4 text-[11px] leading-relaxed text-[#666]">
          <p>Valores puestos en fábrica, flete aparte. Cotización válida por 10 días hábiles.</p>
          <p>Las medidas especiales se fabrican a pedido. Para preguntas sobre esta cotización: Neltume.co@gmail.com</p>
        </footer>
      </article>
    </>
  );
}
