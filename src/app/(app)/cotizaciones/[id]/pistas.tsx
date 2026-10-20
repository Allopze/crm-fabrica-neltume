"use client";

import Link from "next/link";
import { CalendarClock, Copy, UserCheck, UserPlus } from "lucide-react";
import { Boton, BotonLink } from "@/components/ui/base";
import { fecha } from "@/lib/formato";
import { formatearRut } from "@/domain/rut";
import type { CotizacionDetalle } from "./tipos";

type Pistas = CotizacionDetalle["pistas"];
type PorDato = "rut" | "correo" | "telefono";

const POR: Record<PorDato, string> = { rut: "el RUT", correo: "el correo", telefono: "el teléfono" };
const ESTADO: Record<string, string> = { interpretando: "interpretando", borrador: "borrador", ia_fallida: "borrador", aprobada: "aprobada" };
const aviso = "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-5 py-3 text-sm";

/** Sugerencias tomadas del texto, sin IA (REQ-COT-2.18–2.20). Ninguna se aplica sin un clic. */
export function PistasBorrador({ pistas, deshabilitado, puedeCrearCliente, onAsignar }: {
  pistas: Pistas; deshabilitado: boolean; puedeCrearCliente: boolean;
  onAsignar: (clienteId: string, por: PorDato) => void;
}) {
  const { cliente, repetidas, plazo } = pistas;
  return (
    <>
      {cliente && cliente.clientes.length > 0 && (
        <div role="status" className={`${aviso} border-pizarra/30 bg-pizarra-velo text-pizarra`}>
          <p className="flex items-center gap-2"><UserCheck className="h-4 w-4 shrink-0" />
            <span>{cliente.clientes.length === 1
              ? <>Por {POR[cliente.por]} del texto, parece de <strong>{cliente.clientes[0].nombre}</strong>.</>
              : <>{POR[cliente.por][0].toUpperCase() + POR[cliente.por].slice(1)} del texto coincide con {cliente.clientes.length} clientes: elige cuál.</>}</span></p>
          <div className="flex flex-wrap gap-2">
            {cliente.clientes.map((x) => (
              <Boton key={x.id} disabled={deshabilitado} onClick={() => onAsignar(x.id, cliente.por)}>
                {cliente.clientes.length === 1 ? "Asignar cliente" : x.nombre}
              </Boton>
            ))}
          </div>
        </div>
      )}
      {cliente?.rutNuevo && (
        <div role="status" className={`${aviso} border-pizarra/30 bg-pizarra-velo text-pizarra`}>
          <p className="flex items-center gap-2"><UserPlus className="h-4 w-4 shrink-0" />
            <span>El texto trae el RUT <span className="font-mono">{formatearRut(cliente.rutNuevo)}</span>, que no está registrado.</span></p>
          {puedeCrearCliente && <BotonLink href={`/clientes?nuevo=${encodeURIComponent(cliente.rutNuevo)}`}>Crear cliente</BotonLink>}
        </div>
      )}
      {repetidas.length > 0 && (
        <div role="status" className={`${aviso} border-ambar/30 bg-ambar-velo text-ambar`}>
          <p className="flex items-center gap-2"><Copy className="h-4 w-4 shrink-0" />
            <span>¿Repetida? {repetidas.map((r, i) => (
              <span key={r.id}>{i > 0 && " · "}<Link href={`/cotizaciones/${r.id}`} className="font-medium underline underline-offset-2">N.º {r.numero}</Link>{" "}
                ({ESTADO[r.estado] ?? r.estado}, {fecha(new Date(r.creadoEn))}, {r.motivo === "mismo_texto" ? "mismo texto" : "mismo cliente y artículos"})</span>
            ))}.</span></p>
        </div>
      )}
      {plazo && <PlazoPedido plazo={plazo} />}
    </>
  );
}

/** El plazo que pidió el cliente: referencia para el vendedor, nunca la entrega comprometida. */
export function PlazoPedido({ plazo }: { plazo: NonNullable<Pistas["plazo"]> }) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border border-linea bg-papel-hundido/60 px-5 py-3 text-sm text-tinta-suave">
      <CalendarClock className="h-4 w-4 shrink-0" />
      <span>El cliente pide plazo: «{plazo.frase}»{plazo.fecha && <> → <strong className="text-tinta">{fecha(plazo.fecha)}</strong></>}. La entrega la compromete una persona en la nota de pedido.</span>
    </p>
  );
}
