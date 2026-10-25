import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { CampoFecha } from "@/components/ui/campo-fecha";
import { campo } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { Filtros } from "@/components/ui/filtros";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { consultarAuditoria, type FiltroAuditoria, opcionesAuditoria } from "@/domain/auditoria-consulta";
import { requerirSesion } from "@/domain/auth/servidor";
import { detalle, resumenDetalle, textoAccion, textoRecurso } from "@/lib/auditoria-texto";
import { cn, fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Auditoría" };

const tono = { ok: "musgo", denegado: "error", error: "ambar" } as const;
const RESULTADO = { ok: "Hecho", denegado: "Denegado", error: "Error" } as const;
const hora = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" });
const FILTROS = ["actor", "recurso", "accion", "resultado", "desde", "hasta"] as const;

type Fila = { ocurridoEn: Date; actor: string | null; correlacionId: string | null };
const mismaOperacion = (a: Fila, b: Fila) =>
  (a.correlacionId !== null && a.correlacionId === b.correlacionId) || (a.actor === b.actor && a.ocurridoEn.getTime() === b.ocurridoEn.getTime());

/** Tarea periódica del sistema que no cambió nada (p. ej. una sincronización con Chipax sin facturas nuevas). */
type Registro = { actorTipo: string; resultado: string; accion: string; recurso: string; despues: unknown };
function sinCambios(e: Registro): boolean {
  if (e.actorTipo !== "sistema" || e.resultado !== "ok" || !e.despues || typeof e.despues !== "object" || Array.isArray(e.despues)) return false;
  const valores = Object.entries(e.despues as Record<string, unknown>);
  return !valores.some(([k]) => k === "error") && valores.some(([, v]) => typeof v === "number") && valores.every(([, v]) => typeof v !== "number" || v === 0);
}

/** Las repeticiones seguidas sin cambios se leen como una sola fila: el registro sigue completo, solo se agrupa al mostrarlo. */
function agrupar<T extends Registro>(datos: T[]): ({ e: T; i: number } | { grupo: T[] })[] {
  const vista: ({ e: T; i: number } | { grupo: T[] })[] = [];
  for (let i = 0; i < datos.length; i++) {
    let j = i;
    while (sinCambios(datos[i]) && j + 1 < datos.length && sinCambios(datos[j + 1]) && datos[j + 1].accion === datos[i].accion && datos[j + 1].recurso === datos[i].recurso) j++;
    if (j > i) { vista.push({ grupo: datos.slice(i, j + 1) }); i = j; } else vista.push({ e: datos[i], i });
  }
  return vista;
}

const ORIGEN: Record<string, string> = { web: "web", api: "API", consola: "consola", worker: "proceso de IA", enlace: "servicio de enlace" };

function Pares({ titulo, valor }: { titulo: string; valor: unknown }) {
  const pares = detalle(valor);
  if (!pares.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-tinta-tenue">{titulo}</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {pares.map(([k, v]) => <div key={k} className="contents"><dt className="text-tinta-tenue">{k}</dt><dd className="break-words text-tinta">{v}</dd></div>)}
      </dl>
    </div>
  );
}

export default async function AuditoriaPage({ searchParams }: PageProps<"/administracion/auditoria">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("auditoria.ver")) return <SinPermiso permiso="auditoria.ver" />;
  const sp = await searchParams;
  const valor = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filtro = Object.fromEntries(FILTROS.map((k) => [k, valor(k)])) as FiltroAuditoria;
  if (filtro.resultado && !(filtro.resultado in tono)) filtro.resultado = undefined;
  for (const k of ["desde", "hasta"] as const) if (filtro[k] && !/^\d{4}-\d{2}-\d{2}$/.test(filtro[k]!)) filtro[k] = undefined;
  if (filtro.actor && !/^[0-9a-f-]{36}$/i.test(filtro.actor)) filtro.actor = undefined;
  const antes = Number(valor("antes"));
  const [{ datos, total, siguiente }, { recursos, actores }] = await Promise.all([
    consultarAuditoria(bd(), { ...filtro, antesDe: antes > 0 ? antes : undefined }),
    opcionesAuditoria(bd()),
  ]);
  const conFiltros = (extra: Record<string, string>) => new URLSearchParams(Object.entries({ ...filtro, ...extra }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Quién hizo qué, cuándo y con qué resultado, incluidos los intentos denegados. El registro no se puede editar ni borrar."
        acciones={<span className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue"><Lock className="h-4 w-4" /> solo lectura</span>}
      />
      <Filtros>
        <Dropdown name="actor" defaultValue={filtro.actor ?? ""} aria-label="Actor">
          <option value="">Todos los actores</option>
          {actores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </Dropdown>
        <Dropdown name="recurso" defaultValue={filtro.recurso ?? ""} aria-label="Recurso">
          <option value="">Todos los recursos</option>
          {recursos.map((r) => <option key={r} value={r}>{textoRecurso(r)}</option>)}
        </Dropdown>
        <input type="search" name="accion" defaultValue={filtro.accion ?? ""} placeholder="Acción contiene…" className={campo} aria-label="Acción" maxLength={80} />
        <Dropdown name="resultado" defaultValue={filtro.resultado ?? ""} aria-label="Resultado">
          <option value="">Todo resultado</option><option value="ok">Hecho</option><option value="denegado">Denegado</option><option value="error">Error</option>
        </Dropdown>
        <span className="flex items-center gap-1.5 text-sm text-tinta-suave">Desde <CampoFecha name="desde" defaultValue={filtro.desde ?? ""} aria-label="Desde" /></span>
        <span className="flex items-center gap-1.5 text-sm text-tinta-suave">Hasta <CampoFecha name="hasta" defaultValue={filtro.hasta ?? ""} aria-label="Hasta" /></span>
        {FILTROS.some((k) => filtro[k]) && <Link href="/administracion/auditoria" className="self-center text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </Filtros>
      <Panel sinRelleno>
        {datos.length === 0 ? <Vacio titulo="Sin registros">No hay registros con estos filtros.</Vacio> : (
          <Tabla etiqueta="Registro de auditoría" fija>
            <thead><tr><Th>Fecha</Th><Th>Quién</Th><Th>Acción</Th><Th>Sobre</Th><Th>Resultado</Th><Th>Detalle</Th></tr></thead>
            <tbody>
              {agrupar(datos).map((v) => {
                if ("grupo" in v) {
                  const [ultima] = v.grupo;
                  const primera = v.grupo.at(-1)!;
                  return (
                    <Tr key={`g${ultima.id}`}>
                      <Td className="whitespace-nowrap text-xs tabular-nums text-tinta-suave">{fecha(dia.format(ultima.ocurridoEn))} {hora.format(ultima.ocurridoEn)}</Td>
                      <Td><span className="text-tinta-tenue">Sistema</span></Td>
                      <Td className="font-medium">{textoAccion(ultima.accion)}</Td>
                      <Td className="text-tinta-suave">{textoRecurso(ultima.recurso)}</Td>
                      <Td><Etiqueta tono="musgo">Hecho</Etiqueta></Td>
                      <Td className="max-w-md text-sm text-tinta-suave">
                        <details>
                          <summary className="cursor-pointer">Sin cambios · {v.grupo.length} veces desde {fecha(dia.format(primera.ocurridoEn))} {hora.format(primera.ocurridoEn).slice(0, 5)}</summary>
                          <p className="mt-2 rounded bg-papel-hundido p-3 text-xs tabular-nums">{v.grupo.map((g) => hora.format(g.ocurridoEn).slice(0, 5)).join(" · ")}</p>
                        </details>
                      </Td>
                    </Tr>
                  );
                }
                const { e, i } = v;
                // Una misma operación (p. ej. cerrar una orden) deja varias filas en la misma transacción: se leen como un bloque.
                const sigue = i > 0 && mismaOperacion(e, datos[i - 1]);
                const continua = i + 1 < datos.length && mismaOperacion(e, datos[i + 1]);
                return (
                  <Tr key={e.id} className={cn(continua && "border-b-0!")}>
                    <Td className="whitespace-nowrap text-xs tabular-nums text-tinta-suave">{sigue ? <span className="pl-3 text-tinta-tenue" aria-label="misma operación">└</span> : <>{fecha(dia.format(e.ocurridoEn))} {hora.format(e.ocurridoEn)}</>}</Td>
                    <Td>{sigue ? null : e.actor ?? <span className="text-tinta-tenue">{e.actorTipo === "sistema" ? "Sistema" : e.actorTipo}</span>}</Td>
                    <Td className="font-medium">{textoAccion(e.accion)}</Td>
                    <Td className="text-tinta-suave">{textoRecurso(e.recurso)}</Td>
                    <Td><Etiqueta tono={tono[e.resultado as keyof typeof tono] ?? "neutro"}>{RESULTADO[e.resultado as keyof typeof RESULTADO] ?? e.resultado}</Etiqueta></Td>
                    <Td className="max-w-md text-sm text-tinta-suave">
                      {(e.antes != null || e.despues != null) ? (
                        <details>
                          <summary className="cursor-pointer">{resumenDetalle(e.despues ?? e.antes) || "Ver detalle"}</summary>
                          <div className="mt-2 space-y-3 rounded bg-papel-hundido p-3">
                            <Pares titulo="Antes" valor={e.antes} />
                            <Pares titulo="Después" valor={e.despues} />
                            <p className="text-xs text-tinta-tenue">Desde {ORIGEN[e.origen] ?? e.origen}{e.ip ? ` · IP ${e.ip}` : ""}</p>
                          </div>
                        </details>
                      ) : <span className="text-tinta-tenue">Desde {ORIGEN[e.origen] ?? e.origen}</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={total} singular="registro" plural="registros" etiquetaSiguiente="Más antiguos"
        inicio={antes > 0 ? `/administracion/auditoria?${conFiltros({})}` : undefined}
        siguiente={siguiente ? `/administracion/auditoria?${conFiltros({ antes: String(siguiente) })}` : null} />
    </>
  );
}
