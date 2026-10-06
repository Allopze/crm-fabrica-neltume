import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { consultarAuditoria, type FiltroAuditoria, opcionesAuditoria } from "@/domain/auditoria-consulta";
import { requerirSesion } from "@/domain/auth/servidor";
import { fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Auditoría" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const tono = { ok: "musgo", denegado: "error", error: "ambar" } as const;
const hora = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" });
const FILTROS = ["actor", "recurso", "accion", "resultado", "desde", "hasta"] as const;

function resumen(v: unknown): string {
  if (v === null || v === undefined) return "";
  const t = JSON.stringify(v).replace(/[{}"]/g, "").replace(/,/g, ", ").replace(/:/g, ": ");
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
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
        antetitulo="Configuración · trazabilidad"
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
          {recursos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input name="accion" defaultValue={filtro.accion ?? ""} placeholder="Acción contiene…" className={campo} aria-label="Acción" maxLength={80} />
        <select name="resultado" defaultValue={filtro.resultado ?? ""} className={campo} aria-label="Resultado">
          <option value="">Todo resultado</option><option value="ok">ok</option><option value="denegado">denegado</option><option value="error">error</option>
        </select>
        <input type="date" name="desde" defaultValue={filtro.desde ?? ""} className={campo} aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={filtro.hasta ?? ""} className={campo} aria-label="Hasta" />
        <Boton type="submit">Filtrar</Boton>
        {FILTROS.some((k) => filtro[k]) && <Link href="/administracion/auditoria" className="self-center text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </form>
      <Panel sinRelleno>
        {datos.length === 0 ? <p className="px-6 py-10 text-center text-sm text-tinta-tenue">No hay registros con estos filtros.</p> : (
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Actor</Th><Th>Acción</Th><Th>Recurso</Th><Th>Resultado</Th><Th>Detalle</Th></tr></thead>
            <tbody>
              {datos.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-tinta-suave">{fecha(dia.format(e.ocurridoEn))} {hora.format(e.ocurridoEn)}</Td>
                  <Td>{e.actor ?? <span className="text-tinta-tenue">{e.actorTipo}</span>}</Td>
                  <Td className="font-medium">{e.accion}</Td>
                  <Td className="text-tinta-suave">{e.recurso}{e.recursoId && <span className="block font-mono text-[11px] text-tinta-tenue">{e.recursoId.slice(0, 8)}</span>}</Td>
                  <Td><Etiqueta tono={tono[e.resultado as keyof typeof tono] ?? "neutro"}>{e.resultado}</Etiqueta></Td>
                  <Td className="max-w-md text-sm text-tinta-suave">
                    {(e.antes != null || e.despues != null) ? (
                      <details>
                        <summary className="cursor-pointer">{resumen(e.despues ?? e.antes)}</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-papel-hundido p-2 font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify({ antes: e.antes, despues: e.despues, origen: e.origen, ip: e.ip, correlacion: e.correlacionId }, null, 2)}</pre>
                      </details>
                    ) : <span className="text-tinta-tenue">{e.origen}</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && <p className="mt-4 text-sm"><Link href={`/administracion/auditoria?${masAntiguos}`} className="text-rauli hover:underline">Ver más antiguos</Link></p>}
    </>
  );
}
