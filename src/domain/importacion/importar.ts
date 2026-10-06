// Aplica una importación del Excel en una transacción (REQ-STK-1.1–1.3, REQ-COT-1.1).
// Idempotente por hash de archivo y por contenido: sin cambios de precio no crea versión nueva.
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { bd } from "@/db/conexion";
import { articulo, importacion, listaPrecio, madera, modelo, precio, recargoTipo, tipoPuerta } from "@/db/esquema/catalogo";
import { type Actor, registrarAuditoria } from "../auditoria";
import { leerLibro } from "./leer-excel";
import { type ArticuloImportado, MADERAS, mapearFilas } from "./mapear";

export interface InformeImportacion {
  id: string;
  repetida: boolean;
  listaVersion: number | null;
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  rechazadas: number;
  rechazos: { fila: number; motivo: string }[];
}

const LOTE = 500;
const enLotes = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE));
const MOLDURA_O_MARCO = new Set(["MARCO", "PIEZAS T", "PILASTRA", "ENDOLADO", "GUARDAPOLVO"]);

export async function importarExcel(datos: ArrayBuffer, nombreArchivo: string, actor: Actor & { id: string }): Promise<InformeImportacion> {
  const hash = createHash("sha256").update(Buffer.from(datos)).digest("hex");
  const [previa] = await bd().select().from(importacion).where(eq(importacion.archivoHash, hash)).orderBy(desc(importacion.creadoEn)).limit(1);
  if (previa) {
    const [lista] = previa.listaId ? await bd().select({ v: listaPrecio.version }).from(listaPrecio).where(eq(listaPrecio.id, previa.listaId)) : [];
    return { id: previa.id, repetida: true, listaVersion: lista?.v ?? null, creadas: 0, actualizadas: 0, sinCambios: previa.creadas + previa.actualizadas + previa.sinCambios, rechazadas: previa.rechazadas, rechazos: previa.rechazos as InformeImportacion["rechazos"] };
  }

  const { categorias, filas } = await leerLibro(datos);
  const { validos, rechazos } = mapearFilas(filas, categorias);

  return bd().transaction(async (tx) => {
    // Referencias: modelos de Categorias, 4 maderas y tipos de puerta.
    for (const [nombre, codigo] of categorias.modelos) {
      await tx.insert(modelo).values({ nombre, codigo, familia: MOLDURA_O_MARCO.has(nombre) ? "accesorio" : "puerta" }).onConflictDoNothing();
    }
    for (const [nombre, codigo] of Object.entries(MADERAS)) await tx.insert(madera).values({ nombre, codigo }).onConflictDoNothing();
    const idModelo = new Map((await tx.select({ id: modelo.id, nombre: modelo.nombre }).from(modelo)).map((m) => [m.nombre, m.id]));
    const idMadera = new Map((await tx.select({ id: madera.id, nombre: madera.nombre }).from(madera)).map((m) => [m.nombre, m.id]));
    const idTipo = new Map((await tx.select({ id: tipoPuerta.id, nombre: tipoPuerta.nombre }).from(tipoPuerta)).map((t) => [t.nombre, t.id]));

    // Artículos: insertar nuevos y actualizar los que cambiaron (por código).
    const existentes = new Map((await tx.select().from(articulo)).map((a) => [a.codigo, a]));
    const fila = (a: ArticuloImportado) => ({
      codigo: a.codigo, modeloId: idModelo.get(a.modelo)!, maderaId: idMadera.get(a.madera)!, anchoCodigo: a.anchoCodigo,
      anchoEtiqueta: a.anchoEtiqueta, altoCodigo: a.altoCodigo, altoM: a.altoM, espesor: a.espesor, pulgadas: a.pulgadas,
      tipoPuertaId: a.tipo ? idTipo.get(a.tipo)! : null,
    });
    const nuevos = validos.filter((a) => !existentes.has(a.codigo));
    let actualizadas = 0;
    for (const lote of enLotes(nuevos)) await tx.insert(articulo).values(lote.map(fila));
    for (const a of validos.filter((x) => existentes.has(x.codigo))) {
      const e = existentes.get(a.codigo)!;
      const f = fila(a);
      const cambio = (Object.keys(f) as (keyof typeof f)[]).some((k) => k !== "codigo" && String(f[k] ?? "") !== String(e[k] ?? ""));
      if (cambio) { await tx.update(articulo).set(f).where(eq(articulo.id, e.id)); actualizadas++; }
    }
    const idArticulo = new Map((await tx.select({ id: articulo.id, codigo: articulo.codigo }).from(articulo)).map((a) => [a.codigo, a.id]));

    // Precios: versión nueva solo si cambia algo respecto de la vigente (REQ-STK-1.3).
    const [vigente] = await tx.select().from(listaPrecio).where(eq(listaPrecio.vigente, true));
    const preciosVigentes = vigente ? new Map((await tx.select().from(precio).where(eq(precio.listaId, vigente.id))).map((p) => [p.articuloId, p.precioNeto])) : new Map();
    const hayCambios = !vigente || validos.length !== preciosVigentes.size
      || validos.some((a) => Number(preciosVigentes.get(idArticulo.get(a.codigo)!)) !== Number(a.precioNeto.toFixed(4)));

    let listaId: string | null = null;
    let listaVersion: number | null = vigente?.version ?? null;
    if (hayCambios && validos.length) {
      if (vigente) await tx.update(listaPrecio).set({ vigente: false }).where(eq(listaPrecio.id, vigente.id));
      const [nueva] = await tx.insert(listaPrecio)
        .values({ origen: "excel", archivoHash: hash, descripcion: `Importación de ${nombreArchivo}`, vigente: true, creadoPor: actor.id })
        .returning({ id: listaPrecio.id, version: listaPrecio.version });
      listaId = nueva.id;
      listaVersion = nueva.version;
      for (const lote of enLotes(validos)) {
        await tx.insert(precio).values(lote.map((a) => ({
          listaId: nueva.id, articuloId: idArticulo.get(a.codigo)!, costoProduccion: a.costos.produccion, costoMateriales: a.costos.materiales,
          costoInsumos: a.costos.insumos, costosGenerales: a.costos.generales, costoTotal: a.costos.total, margen: a.margen, precioNeto: a.precioNeto,
        })));
      }
      // Recargos: se heredan de la versión anterior; en la primera carga, 0 % por tipo y para accesorios (DESIGN C2).
      const anteriores = vigente ? await tx.select().from(recargoTipo).where(eq(recargoTipo.listaId, vigente.id)) : [];
      const base = anteriores.length ? anteriores.map((r) => ({ tipoPuertaId: r.tipoPuertaId, porcentaje: r.porcentaje }))
        : [...[...idTipo.values()].map((id) => ({ tipoPuertaId: id, porcentaje: 0 })), { tipoPuertaId: null, porcentaje: 0 }];
      await tx.insert(recargoTipo).values(base.map((r) => ({ ...r, listaId: nueva.id })));
    }

    const informe = { creadas: nuevos.length, actualizadas, sinCambios: validos.length - nuevos.length - actualizadas, rechazadas: rechazos.length };
    const [imp] = await tx.insert(importacion)
      .values({ archivoHash: hash, nombreArchivo, listaId, ...informe, rechazos, creadoPor: actor.id })
      .returning({ id: importacion.id });
    // Auditoría: solo conteos, hash y filas rechazadas; nunca costos ni precios (DATA-MODEL §5).
    await registrarAuditoria(tx, {
      actor, accion: "importar excel", recurso: "importacion", recursoId: imp.id, resultado: "ok", origen: "importacion",
      despues: { archivo: nombreArchivo, hash, listaVersion, ...informe, filasRechazadas: rechazos.map((r) => r.fila) },
    });
    return { id: imp.id, repetida: false, listaVersion, ...informe, rechazos };
  });
}

