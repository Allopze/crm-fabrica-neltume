import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { modelo } from "@/db/esquema/catalogo";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarBoms, maderasConInsumo } from "@/domain/bom";
import { listarMateriasPrimas } from "@/domain/materias-primas";
import { listarOrdenes, planDeCierre } from "@/domain/ordenes";
import { cn, fecha, numero } from "@/lib/formato";
import { CierreOrden, NuevaOrden } from "./acciones-orden";
import { EditorBom } from "./editor-bom";
import { MaderaInsumo } from "./madera-insumo";

export const metadata: Metadata = { title: "Producción y BOM" };
const ESTADO = { abierta: ["Abierta", "pizarra"], cerrada: ["Cerrada", "musgo"], anulada: ["Anulada", "neutro"] } as const;

export default async function ProduccionPage({ searchParams }: PageProps<"/produccion">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const gestiona = sesion.permisos.has("produccion.gestionar");
  const sp = await searchParams;
  const [ordenes, boms, materias, modelos, maderas] = await Promise.all([
    gestiona ? listarOrdenes(bd()) : Promise.resolve([]), listarBoms(bd()), listarMateriasPrimas(bd()),
    bd().select({ codigo: modelo.codigo, nombre: modelo.nombre }).from(modelo).where(eq(modelo.familia, "puerta")).orderBy(asc(modelo.nombre)),
    maderasConInsumo(bd()),
  ]);
  const usaMadera = boms.some((b) => b.lineas.some((l) => l.maderaPuerta));
  const abiertas = ordenes.filter((o) => o.estado === "abierta");
  const elegida = abiertas.find((o) => o.id === sp.orden) ?? abiertas[0];
  const plan = elegida ? await planDeCierre(bd(), elegida.id) : null;
  const activas = materias.filter((m) => m.activo).map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }));

  return (
    <>
      <Encabezado
        antetitulo="Taller · producción"
        titulo="Producción y BOM"
        descripcion="Al cerrar una orden, el sistema descuenta los insumos según el BOM y suma las puertas terminadas, todo en un solo paso."
        acciones={gestiona && <NuevaOrden csrf={sesion.csrf} />}
      />

      {gestiona && (
        <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr]">
          <Panel titulo="Órdenes de producción" sinRelleno>
            {ordenes.length === 0 ? <Vacio titulo="Aún no hay órdenes">Crea una con «Nueva orden».</Vacio> : (
              <Tabla>
                <thead><tr><Th>N.º</Th><Th>Artículos</Th><Th>Creada</Th><Th>Estado</Th></tr></thead>
                <tbody>
                  {ordenes.map((o) => (
                    <Tr key={o.id} className={cn(o.id === elegida?.id && "bg-rauli-velo/40")}>
                      <Td className="font-mono">{o.estado === "abierta" ? <Link href={`/produccion?orden=${o.id}`} className="text-rauli hover:underline">{o.numero}</Link> : o.numero}</Td>
                      <Td>{o.lineas.map((l) => <span key={l.codigo} className="mr-2 inline-flex items-center gap-1"><Placa codigo={l.codigo} /> ×{l.cantidad}</span>)}</Td>
                      <Td className="text-tinta-suave">{fecha(new Date(o.creadaEn).toISOString())}</Td>
                      <Td><Etiqueta tono={ESTADO[o.estado as keyof typeof ESTADO][1]}>{ESTADO[o.estado as keyof typeof ESTADO][0]}</Etiqueta></Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Panel>
          {elegida && plan && (
            <Panel titulo={<>Cerrar orden {elegida.numero}</>} accion={Object.values(plan.origenBom).includes("demo") && <Etiqueta tono="ambar">BOM DEMO</Etiqueta>}>
              <p className="mb-4 text-sm text-tinta-suave">
                Entrarán {plan.lineas.map((l) => <strong key={l.codigo} className="text-tinta">{l.cantidad} × <Placa codigo={l.codigo} /> </strong>)} al stock y se consumirá:
              </p>
              <CierreOrden ordenId={elegida.id} numero={elegida.numero} insumos={plan.insumos} sinBom={plan.sinBom} incompletos={plan.incompletos}
                demo={Object.values(plan.origenBom).includes("demo")} materias={activas} csrf={sesion.csrf} />
            </Panel>
          )}
        </div>
      )}

      <div className="mt-14 mb-4 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-medium tracking-tight">Listas de materiales</h2>
        {sesion.permisos.has("mp.editar") && activas.length > 0 && modelos.length > 0 && <EditorBom modelos={modelos} materias={activas} csrf={sesion.csrf} />}
      </div>
      {(usaMadera || maderas.some((m) => m.materiaPrimaId)) && (
        <Panel className="mb-5" titulo="Madera de la puerta" accion={maderas.some((m) => !m.materiaPrimaId) && <Etiqueta tono="ambar">FALTA ASOCIAR</Etiqueta>}>
          <p className="mb-2 text-sm text-tinta-suave">Al cerrar una orden, las pulgadas de cada artículo se descuentan de la materia prima de su madera.</p>
          <MaderaInsumo maderas={maderas} materias={activas} editable={sesion.permisos.has("mp.editar")} csrf={sesion.csrf} />
        </Panel>
      )}
      {boms.length === 0 ? (
        <Panel><Vacio titulo="Aún no hay BOM">Defínelos con Producción o carga los de demostración con <code className="font-mono text-xs">npm run demo:preparar</code>.</Vacio></Panel>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {boms.map((b) => (
            <Panel key={b.id} titulo={<span className="capitalize">{b.modelo.toLowerCase()}</span>} accion={<Etiqueta tono={b.origen === "demo" ? "ambar" : "musgo"}>{b.origen === "demo" ? "DEMO" : "real"}</Etiqueta>}>
              <p className="mb-3 font-mono text-xs text-tinta-tenue">{b.ancho || b.alto ? `medida ${b.ancho ?? "*"}-${b.alto ?? "*"}` : "todas las medidas"} · por puerta</p>
              <ul className="space-y-1.5 text-sm">
                {b.lineas.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className={cn("truncate", l.maderaPuerta && "font-medium")}>{l.mp}</span>
                    <span className="shrink-0 font-mono tabular-nums">{l.maderaPuerta ? `× ${numero(l.cantidad)} pulg. del artículo` : `${numero(l.cantidad)} ${l.unidad}`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
