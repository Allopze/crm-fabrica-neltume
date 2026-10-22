"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, fecha } from "@/lib/formato";
import { formatearMientrasEscribe, hoyIso, leerFecha, semanasDelMes, sumarDias } from "@/lib/fecha-campo";
import { campo } from "./campos";

const MES = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
const DIA = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SEMANA = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const aFecha = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const dos = (n: number) => String(n).padStart(2, "0");

/** Mismo día (o el último del mes si no existe) `meses` meses antes o después. */
function otroMes(iso: string, meses: number, dia?: number): string {
  const d = aFecha(iso);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  return `${m.getUTCFullYear()}-${dos(m.getUTCMonth() + 1)}-${dos(Math.min(dia ?? d.getUTCDate(), ultimo))}`;
}

/**
 * Fecha escrita dd-mm-aaaa (también con / o .) o elegida en un calendario propio (UX §1): el campo nativo cambia de
 * formato según el idioma del navegador. Envía «aaaa-mm-dd» con su `name` y avisa el cambio con un evento `change`.
 */
export function CampoFecha({ name, defaultValue = "", value, onChange, required, max, id, className, "aria-label": etiqueta }: {
  name?: string; defaultValue?: string; value?: string; onChange?: (iso: string) => void; required?: boolean;
  /** Última fecha permitida («aaaa-mm-dd»), p. ej. hoy para un pago. */
  max?: string; id?: string; className?: string; "aria-label"?: string;
}) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue);
  const iso = controlado ? value : interno;
  const [texto, setTexto] = useState(iso ? fecha(iso) : "");
  const [base, setBase] = useState(iso);
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState(iso || hoyIso());
  const raiz = useRef<HTMLSpanElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const oculta = useRef<HTMLInputElement>(null);
  const avisar = useRef(false);
  const enfocarDia = useRef(false);
  const calendarioId = `${useId()}-calendario`;

  // Si el valor cambia desde afuera (controlado o reinicio), el texto lo sigue.
  if (iso !== base) { setBase(iso); setTexto(iso ? fecha(iso) : ""); }

  function fijar(nuevo: string) {
    if (nuevo === iso) return;
    avisar.current = true;
    if (!controlado) setInterno(nuevo);
    onChange?.(nuevo);
  }

  useEffect(() => {
    if (!avisar.current) return;
    avisar.current = false;
    oculta.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [iso]);

  useEffect(() => {
    const form = entrada.current?.form;
    if (!form || controlado) return;
    const reiniciar = () => { setInterno(defaultValue); setAbierto(false); };
    form.addEventListener("reset", reiniciar);
    return () => form.removeEventListener("reset", reiniciar);
  }, [controlado, defaultValue]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  // Al abrir y al moverse con el teclado, el foco sigue al día marcado.
  useEffect(() => {
    if (!abierto || !enfocarDia.current) return;
    enfocarDia.current = false;
    raiz.current?.querySelector<HTMLButtonElement>("[data-foco=si]")?.focus();
  }, [abierto, foco]);

  function abrir() {
    setFoco(iso || hoyIso());
    enfocarDia.current = true;
    setAbierto(true);
  }

  function escribir(t: string) {
    const formateado = formatearMientrasEscribe(t);
    setTexto(formateado);
    const leida = leerFecha(formateado);
    const tarde = Boolean(leida && max && leida > max);
    entrada.current?.setCustomValidity(formateado.trim() && !leida ? "Escribe la fecha como dd-mm-aaaa." : tarde ? `La fecha no puede ser posterior al ${fecha(max!)}.` : "");
    if (leida && !tarde) fijar(leida);
    else if (!formateado.trim()) fijar("");
  }

  function elegir(nuevo: string) {
    fijar(nuevo);
    setTexto(fecha(nuevo));
    entrada.current?.setCustomValidity("");
    setAbierto(false);
    entrada.current?.focus();
  }

  function teclaCalendario(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.preventDefault(); setAbierto(false); entrada.current?.focus(); return; }
    if (!(e.target as HTMLElement).dataset.dia) return;
    const pasos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const semana = (aFecha(foco).getUTCDay() + 6) % 7;
    let nuevo: string;
    if (e.key in pasos) nuevo = sumarDias(foco, pasos[e.key]);
    else if (e.key === "PageUp" || e.key === "PageDown") nuevo = otroMes(foco, e.key === "PageUp" ? -1 : 1);
    else if (e.key === "Home" || e.key === "End") nuevo = sumarDias(foco, e.key === "Home" ? -semana : 6 - semana);
    else return;
    e.preventDefault();
    enfocarDia.current = true;
    setFoco(nuevo);
  }

  const vista = aFecha(foco);
  const semanas = semanasDelMes(vista.getUTCFullYear(), vista.getUTCMonth() + 1);
  const hoy = hoyIso();
  const mover = (meses: number) => setFoco(otroMes(foco, meses, 1));

  return (
    <span ref={raiz} className={cn("relative inline-block w-40 max-w-full align-middle", className)}>
      {name && <input ref={oculta} type="hidden" name={name} value={iso} />}
      <input ref={entrada} id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="dd-mm-aaaa" maxLength={10}
        aria-label={etiqueta} required={required} value={texto} aria-invalid={Boolean(texto.trim()) && !leerFecha(texto) ? true : undefined}
        onChange={(e) => escribir(e.target.value)}
        onBlur={() => { const leida = leerFecha(texto); if (leida) setTexto(fecha(leida)); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); abrir(); } }}
        className={cn(campo, "w-full pr-9 font-mono tabular-nums aria-[invalid=true]:border-error")} />
      <button type="button" aria-label="Elegir en el calendario" aria-expanded={abierto} aria-controls={abierto ? calendarioId : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-tinta-tenue hover:text-tinta">
        <CalendarDays className="h-4 w-4" />
      </button>
      {abierto && (
        <div id={calendarioId} role="dialog" aria-label="Calendario" onKeyDown={teclaCalendario}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-linea-fuerte bg-lamina p-3 shadow-[0_12px_30px_-14px_rgb(30_40_30/0.5)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)} className="grid h-8 w-8 place-items-center rounded hover:bg-papel-hundido pointer-coarse:h-11 pointer-coarse:w-11"><ChevronLeft className="h-4 w-4" /></button>
            <p aria-live="polite" className="font-display text-base first-letter:uppercase">{MES.format(vista)}</p>
            <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)} className="grid h-8 w-8 place-items-center rounded hover:bg-papel-hundido pointer-coarse:h-11 pointer-coarse:w-11"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
            {SEMANA.map((s) => <span key={s} aria-hidden className="pb-1 text-[11px] uppercase tracking-wider text-tinta-tenue">{s}</span>)}
            {semanas.flat().map((dia, i) => dia === null ? <span key={`v${i}`} /> : (
              <button key={dia} type="button" data-dia={dia} tabIndex={dia === foco ? 0 : -1} data-foco={dia === foco ? "si" : undefined}
                disabled={Boolean(max && dia > max)}
                aria-label={DIA.format(aFecha(dia))} aria-pressed={dia === iso} aria-current={dia === hoy ? "date" : undefined}
                onClick={() => elegir(dia)}
                className={cn("h-9 rounded tabular-nums hover:bg-rauli-velo disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent pointer-coarse:h-11",
                  dia === iso ? "bg-rauli font-medium text-lamina hover:bg-rauli-hondo" : dia === hoy && "font-semibold text-rauli ring-1 ring-inset ring-rauli/40")}>
                {Number(dia.slice(8))}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-linea pt-2 text-sm">
            <button type="button" disabled={Boolean(max && hoy > max)} onClick={() => elegir(hoy)} className="rounded px-2 py-1 text-rauli hover:bg-rauli-velo disabled:opacity-40">Hoy</button>
            {!required && iso && <button type="button" onClick={() => { fijar(""); setTexto(""); setAbierto(false); entrada.current?.focus(); }} className="rounded px-2 py-1 text-tinta-suave hover:bg-papel-hundido">Borrar</button>}
          </div>
        </div>
      )}
    </span>
  );
}
