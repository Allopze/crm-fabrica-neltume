import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { Aviso, Boton, Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { modelo } from "@/db/esquema/catalogo";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarBoms, maderasConInsumo } from "@/domain/bom";
import { listarMateriasPrimas } from "@/domain/materias-primas";
import { NOMBRE_MADERA } from "@/domain/cotizaciones/mapear";
import { listarOrdenes, planDeCierre } from "@/domain/ordenes";
import { cn, fecha } from "@/lib/formato";
import { CierreOrden, NuevaOrden } from "./acciones-orden";
import { AplicarRecetas } from "./aplicar-recetas";
import { EditorBom } from "./editor-bom";
import { LineasBom } from "./lineas-bom";
import { MaderaInsumo } from "./madera-insumo";

export const metadata: Metadata = { title: "Producción y BOM" };
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
const ESTADO = { abierta: ["Abierta", "pizarra"], cerrada: ["Cerrada", "musgo"], anulada: ["Anulada", "neutro"] } as const;
type Vista = "ordenes" | "recetas" | "madera";

/** Pestañas: el trabajo del día (órdenes) separado de la configuración (recetas y madera). */
function Pestanas({ vista, gestiona, maderaLista }: { vista: Vista; gestiona: boolean; maderaLista: boolean }) {
  const pestanas = [
    ...(gestiona ? [{ id: "ordenes" as const, texto: "Órdenes" }] : []),
    { id: "recetas" as const, texto: "Recetas (BOM)" },
    { id: "madera" as const, texto: "Madera de la puerta", aviso: !maderaLista },
  ];
  return (
    <nav aria-label="Secciones de producción" className="mb-6 flex flex-wrap gap-1 border-b border-linea">
      {pestanas.map((p) => (
        <Link key={p.id} href={`/produccion?vista=${p.id}`} aria-current={vista === p.id ? "page" : undefined}
          className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm pointer-coarse:py-3.5",
            vista === p.id ? "border-rauli font-medium text-tinta" : "border-transparent text-tinta-suave hover:text-tinta")}>
          {p.texto}{"aviso" in p && p.aviso && <span className="rounded-full bg-ambar-velo px-1.5 text-xs text-ambar">falta asociar</span>}
        </Link>
      ))}
    </nav>
  );
}

export default async function ProduccionPage({ searchParams }: PageProps<"/produccion">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const gestiona = sesion.permisos.has("produccion.gestionar");
  const sp = await searchParams;
  const [ordenes, boms, materias, modelos, maderas] = await Promise.all([
    gestiona ? listarOrdenes(bd()) : Promise.resolve([]), listarBoms(bd()), listarMateriasPrimas(bd()),
    bd().select({ codigo: modelo.codigo, nombre: modelo.nombre }).from(modelo).orderBy(desc(modelo.familia), asc(modelo.nombre)),
    maderasConInsumo(bd()),
  ]);
  const editaBom = sesion.permisos.has("mp.editar") && modelos.length > 0;
  const maderaLista = maderas.every((m) => m.materiaPrimaId);
  const generales = boms.filter((b) => !b.ancho && !b.alto);
  const editar = typeof sp.editar === "string" ? boms.find((b) => b.id === sp.editar) : undefined;
  const abiertas = ordenes.filter((o) => o.estado === "abierta");
  // Tras cerrar una orden no se elige otra sola: queda el aviso y la persona decide la siguiente.
  const cerrada = typeof sp.cerrada === "string" ? sp.cerrada : null;
  const elegida = abiertas.find((o) => o.id === sp.orden) ?? (cerrada ? undefined : abiertas[0]);
  const plan = elegida ? await planDeCierre(bd(), elegida.id) : null;
  const filtroBom = typeof sp.modelo === "string" ? sp.modelo.trim() : "";
  const visibles = filtroBom
    ? boms.filter((b) => `${b.modelo} ${b.modeloCodigo}`.toLowerCase().includes(filtroBom.toLowerCase()))
    : boms;
  const activas = materias.filter((m) => m.activo).map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }));
  const pedida = typeof sp.vista === "string" && ["ordenes", "recetas", "madera"].includes(sp.vista) ? sp.vista as Vista : null;
  const vista: Vista = editar || filtroBom ? "recetas" : pedida === "ordenes" && !gestiona ? "recetas" : pedida ?? (gestiona ? "ordenes" : "recetas");

  return (
    <>
      <Encabezado
        titulo="Producción y BOM"
        descripcion="Al cerrar una orden, el sistema descuenta los insumos según el BOM y suma las puertas terminadas, todo en un solo paso."
        acciones={gestiona && vista === "ordenes" && <NuevaOrden csrf={sesion.csrf} />}
      />
      <Pestanas vista={vista} gestiona={gestiona} maderaLista={maderaLista} />

      {vista === "ordenes" && gestiona && cerrada && (
        <div className="mb-6">
          <Aviso tono="musgo" titulo={`Orden N.º ${cerrada} cerrada`}>
            Se descontaron los insumos y las puertas entraron al stock.{abiertas.length > 0 && " Elige la siguiente orden en la lista para cerrarla."}
          </Aviso>
        </div>
      )}
      {vista === "ordenes" && gestiona && (
        <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 xl:grid-cols-[1.25fr_1fr]">
          <Panel titulo="Órdenes de producción" sinRelleno>
            {ordenes.length === 0 ? <Vacio titulo="Aún no hay órdenes">Crea una con «Nueva orden».</Vacio> : (
              <Tabla>
                <thead><tr><Th>N.º</Th><Th>Artículos</Th><Th>Creada</Th><Th>Estado</Th></tr></thead>
                <tbody>
                  {ordenes.map((o) => (
                    <Tr key={o.id} className={cn(o.id === elegida?.id && "bg-rauli-velo/40")}>
                      <Td className="tabular-nums">{o.estado === "abierta" ? <Link href={`/produccion?orden=${o.id}`} aria-label={`Orden N.º ${o.numero}`} className="-my-2 inline-block py-2 font-medium text-rauli hover:underline">{o.numero}</Link> : o.numero}</Td>
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
            <Panel titulo={<>Cerrar orden N.º {elegida.numero}</>} accion={Object.values(plan.origenBom).includes("demo") && <Etiqueta tono="ambar">BOM DEMO</Etiqueta>}>
              <p className="mb-4 text-sm text-tinta-suave">
                Entrarán {plan.lineas.map((l) => <strong key={l.codigo} className="text-tinta">{l.cantidad} × <Placa codigo={l.codigo} /> </strong>)} al stock y se consumirá:
              </p>
              <CierreOrden ordenId={elegida.id} numero={elegida.numero} insumos={plan.insumos} sinBom={plan.sinBom} incompletos={plan.incompletos}
                demo={Object.values(plan.origenBom).includes("demo")} materias={activas} csrf={sesion.csrf} />
            </Panel>
          )}
        </div>
      )}

      {vista === "recetas" && <>
      <div id="bom" className="mb-4 flex scroll-mt-20 flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-tinta-suave">Lo que consume una puerta. Cada cambio crea una versión nueva; vale la más reciente.</p>
        {editaBom && !editar && (
          <div className="flex flex-wrap gap-2">
            {boms.length > 0 && <AplicarRecetas recetas={generales.map((b) => ({ modeloCodigo: b.modeloCodigo, modelo: b.modelo, familia: b.familia }))} materias={activas} csrf={sesion.csrf} />}
            <EditorBom modelos={modelos} materias={activas} csrf={sesion.csrf} maderaLista={maderaLista} />
          </div>
        )}
      </div>
      {editaBom && editar && (
        <div className="mb-5">
          <EditorBom key={editar.id} modelos={modelos} materias={activas} csrf={sesion.csrf} maderaLista={maderaLista}
            inicial={{ modeloCodigo: editar.modeloCodigo, origen: editar.origen as "real" | "demo", lineas: editar.lineas }} />
        </div>
      )}
      {boms.length === 0 ? (
        <Panel><Vacio titulo="Aún no hay listas de materiales">Define la primera con «Definir BOM»: qué madera e insumos lleva una puerta del modelo.</Vacio></Panel>
      ) : (
        <Panel sinRelleno>
          <form action="/produccion#bom" className="flex flex-wrap items-center gap-2 border-b border-linea px-5 py-3" role="search" aria-label="Filtrar listas de materiales">
            <input type="hidden" name="vista" value="recetas" />
            <input type="search" name="modelo" defaultValue={filtroBom} placeholder="Modelo o código" aria-label="Filtrar por modelo"
              className="h-9 w-full max-w-64 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none pointer-coarse:h-11" />
            <Boton type="submit">Filtrar</Boton>
            <span className="text-sm text-tinta-tenue">{filtroBom ? `${visibles.length} de ${boms.length} modelos` : `${boms.length} modelos`}</span>
          </form>
          {visibles.length === 0 ? <Vacio titulo="Sin resultados">Ningún modelo coincide con «{filtroBom}».</Vacio> : (
          <Tabla etiqueta="Listas de materiales">
            <thead><tr><Th>Modelo</Th><Th>Por puerta</Th><Th>Vigente desde</Th><Th>Origen</Th>{editaBom && <Th><span className="sr-only">Acciones</span></Th>}</tr></thead>
            <tbody>
              {visibles.map((b) => (
                <Tr key={b.id} className={cn(editar?.id === b.id && "bg-rauli-velo/40")}>
                  <Td className="align-top">
                    <span className="font-medium">{titulo(b.modelo)}</span>
                    <span className="ml-1.5 font-mono text-xs text-tinta-tenue">{b.modeloCodigo}</span>
                    {(b.ancho || b.alto) && <span className="block text-xs text-tinta-tenue">solo medida {b.ancho ?? "*"}-{b.alto ?? "*"}</span>}
                  </Td>
                  <Td>
                    <LineasBom lineas={b.lineas} />
                  </Td>
                  <Td className="align-top whitespace-nowrap text-tinta-suave">{fecha(new Date(b.vigenteDesde).toISOString())}</Td>
                  <Td className="align-top"><Etiqueta tono={b.origen === "demo" ? "ambar" : "musgo"}>{b.origen === "demo" ? "DEMO" : "Real"}</Etiqueta></Td>
                  {editaBom && (
                    <Td className="align-top text-right">
                      <Link href={`/produccion?editar=${b.id}#bom`} scroll={false} className="text-sm font-medium text-rauli underline-offset-2 hover:underline">Editar<span className="sr-only"> BOM de {titulo(b.modelo)}</span></Link>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Tabla>
          )}
        </Panel>
      )}
      </>}

      {vista === "madera" && (activas.length > 0 ? (
        <Panel titulo="Madera de la puerta" accion={!maderaLista && <Etiqueta tono="ambar">Falta asociar</Etiqueta>}>
          <p className="mb-2 text-sm text-tinta-suave">Al cerrar una orden, las pulgadas de cada artículo se descuentan de la materia prima de su madera.</p>
          <MaderaInsumo maderas={maderas.map((m) => ({ ...m, nombre: NOMBRE_MADERA[m.nombre] ?? m.nombre }))} materias={activas} editable={editaBom} csrf={sesion.csrf} />
        </Panel>
      ) : <Panel><Vacio titulo="Aún no hay materias primas">Crea las materias primas de cada madera en Materias primas para poder asociarlas.</Vacio></Panel>)}
    </>
  );
}
