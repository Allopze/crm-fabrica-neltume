import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
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

const ORIGEN: Record<string, string> = { web: "web", api: "API", consola: "consola", worker: "proceso de IA" };

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
  const [{ datos, siguiente }, { recursos, actores }] = await Promise.all([
    consultarAuditoria(bd(), { ...filtro, antesDe: antes > 0 ? antes : undefined }),
    opcionesAuditoria(bd()),
  ]);
  const masAntiguos = new URLSearchParams(Object.entries({ ...filtro, antes: String(siguiente) }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Quién hizo qué, cuándo y con qué resultado, incluidos los intentos denegados. El registro no se puede editar ni borrar."
        acciones={<span className="inline-flex items-center gap-1.5 text-sm text-tinta-tenue"><Lock className="h-4 w-4" /> solo lectura</span>}
      />
      <form method="get" className="mb-5 flex flex-wrap gap-2" aria-label="Filtros">
        <select name="actor" defaultValue={filtro.actor ?? ""} className={campo} aria-label="Actor">
          <option value="">Todos los actores</option>
          {actores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select name="recurso" defaultValue={filtro.recurso ?? ""} className={campo} aria-label="Recurso">
          <option value="">Todos los recursos</option>
          {recursos.map((r) => <option key={r} value={r}>{textoRecurso(r)}</option>)}
        </select>
        <input name="accion" defaultValue={filtro.accion ?? ""} placeholder="Acción contiene…" className={campo} aria-label="Acción" maxLength={80} />
        <select name="resultado" defaultValue={filtro.resultado ?? ""} className={campo} aria-label="Resultado">
          <option value="">Todo resultado</option><option value="ok">Hecho</option><option value="denegado">Denegado</option><option value="error">Error</option>
        </select>
        <input type="date" name="desde" defaultValue={filtro.desde ?? ""} className={campo} aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={filtro.hasta ?? ""} className={campo} aria-label="Hasta" />
        <Boton type="submit">Filtrar</Boton>
        {FILTROS.some((k) => filtro[k]) && <Link href="/administracion/auditoria" className="self-center text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </form>
      <Panel sinRelleno>
        {datos.length === 0 ? <Vacio titulo="Sin registros">No hay registros con estos filtros.</Vacio> : (
          <Tabla etiqueta="Registro de auditoría">
            <thead><tr><Th>Fecha</Th><Th>Quién</Th><Th>Acción</Th><Th>Sobre</Th><Th>Resultado</Th><Th>Detalle</Th></tr></thead>
            <tbody>
              {datos.map((e, i) => {
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
      {siguiente && <p className="mt-4 text-sm"><Link href={`/administracion/auditoria?${masAntiguos}`} className="text-rauli hover:underline">Ver más antiguos</Link></p>}
    </>
  );
}
