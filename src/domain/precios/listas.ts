// Versiones de la lista de precios (REQ-COT-1.1, 1.3–1.5). Nunca se edita una versión: se crea otra.
import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { bd } from "@/db/conexion";
import { articulo, listaPrecio, madera, modelo, precio, recargoTipo, tipoPuerta } from "@/db/esquema/catalogo";
import { usuario } from "@/db/esquema/seguridad";
import { type Actor, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { calcularLinea, conIva } from "./calcular";

export type TipoRecargo = "BLOQUE" | "PANEL" | "ESPECIAL" | "ACCESORIOS";

export async function listarVersiones() {
  return bd()
    .select({
      version: listaPrecio.version, origen: listaPrecio.origen, descripcion: listaPrecio.descripcion, vigente: listaPrecio.vigente,
      creadoEn: listaPrecio.creadoEn, autor: usuario.nombre,
      articulos: sql<number>`(SELECT count(*)::int FROM ${precio} WHERE ${precio.listaId} = ${listaPrecio.id})`,
    })
    .from(listaPrecio)
    .leftJoin(usuario, eq(usuario.id, listaPrecio.creadoPor))
    .orderBy(desc(listaPrecio.version));
}

export async function listaVigente() {
  const [l] = await bd().select().from(listaPrecio).where(eq(listaPrecio.vigente, true));
  return l ?? null;
}

/** Recargos de una versión, por tipo (accesorios = tipo nulo). */
export async function recargosDe(listaId: string): Promise<Record<TipoRecargo, number>> {
  const filas = await bd().select({ tipo: tipoPuerta.nombre, pct: recargoTipo.porcentaje }).from(recargoTipo)
    .leftJoin(tipoPuerta, eq(tipoPuerta.id, recargoTipo.tipoPuertaId)).where(eq(recargoTipo.listaId, listaId));
  const r: Record<TipoRecargo, number> = { BLOQUE: 0, PANEL: 0, ESPECIAL: 0, ACCESORIOS: 0 };
  for (const f of filas) r[(f.tipo ?? "ACCESORIOS") as TipoRecargo] = Number(f.pct);
  return r;
}

export interface FiltroPrecios { q?: string; madera?: string; tipo?: string; cursor?: string; limite?: number }

/** Precios de una versión con precio de venta e IVA calculados. Costos solo si `verCostos`. */
export async function preciosDeLista(version: number, f: FiltroPrecios, verCostos: boolean) {
  const [lista] = await bd().select().from(listaPrecio).where(eq(listaPrecio.version, version));
  if (!lista) throw new ErrorDominio("NO_ENCONTRADO", "Versión de lista inexistente");
  const recargos = await recargosDe(lista.id);
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const condiciones = [eq(precio.listaId, lista.id)];
  if (f.q) condiciones.push(or(ilike(articulo.codigo, `%${f.q}%`), ilike(modelo.nombre, `%${f.q}%`))!);
  if (f.madera) condiciones.push(eq(madera.codigo, f.madera.toUpperCase()));
  if (f.tipo) condiciones.push(eq(tipoPuerta.nombre, f.tipo.toUpperCase()));
  if (f.cursor) condiciones.push(gt(articulo.codigo, f.cursor));

  const filas = await bd()
    .select({
      codigo: articulo.codigo, modelo: modelo.nombre, madera: madera.nombre, maderaCodigo: madera.codigo, ancho: articulo.anchoEtiqueta,
      altoM: articulo.altoM, tipo: tipoPuerta.nombre, precioNeto: precio.precioNeto, costoTotal: precio.costoTotal, margen: precio.margen,
    })
    .from(precio)
    .innerJoin(articulo, eq(articulo.id, precio.articuloId))
    .innerJoin(modelo, eq(modelo.id, articulo.modeloId))
    .innerJoin(madera, eq(madera.id, articulo.maderaId))
    .leftJoin(tipoPuerta, eq(tipoPuerta.id, articulo.tipoPuertaId))
    .where(and(...condiciones))
    .orderBy(asc(articulo.codigo))
    .limit(limite + 1);

  const datos = filas.slice(0, limite).map(({ costoTotal, margen, ...x }) => {
    const recargo = recargos[(x.tipo ?? "ACCESORIOS") as TipoRecargo];
    const { precioUnitario } = calcularLinea({ precioNetoLista: Number(x.precioNeto), recargoPct: recargo, cantidad: 1 });
    return { ...x, recargo, precioVenta: precioUnitario, precioVentaConIva: conIva(precioUnitario), ...(verCostos ? { costoTotal, margen } : {}) };
  });
  return { lista: { version: lista.version, vigente: lista.vigente }, recargos, datos, siguiente: filas.length > limite ? datos.at(-1)!.codigo : null };
}

export interface EdicionLista { cambios?: { codigo: string; precioNeto: number }[]; recargos?: { tipo: TipoRecargo; porcentaje: number }[] }

/** Copia la versión vigente, aplica los cambios y la deja vigente (REQ-COT-1.1). */
export async function crearVersionEditada(e: EdicionLista, actor: Actor & { id: string }) {
  const cambios = e.cambios ?? [];
  const nuevosRecargos = e.recargos ?? [];
  if (!cambios.length && !nuevosRecargos.length) throw new ErrorDominio("VALIDACION", "No hay cambios para crear una versión.");

  return bd().transaction(async (tx) => {
    const [vigente] = await tx.select().from(listaPrecio).where(eq(listaPrecio.vigente, true)).for("update");
    if (!vigente) throw new ErrorDominio("VALIDACION", "Aún no hay lista de precios: importa el Excel primero.");
    const codigos = cambios.map((c) => c.codigo.toUpperCase());
    const arts = codigos.length ? await tx.select({ id: articulo.id, codigo: articulo.codigo }).from(articulo).where(inArray(articulo.codigo, codigos)) : [];
    const faltan = codigos.filter((c) => !arts.some((a) => a.codigo === c));
    if (faltan.length) throw new ErrorDominio("VALIDACION", "Códigos inexistentes", { faltan });
    const idDe = new Map(arts.map((a) => [a.codigo, a.id]));
    const anteriores = new Map((await tx.select().from(precio).where(and(eq(precio.listaId, vigente.id), inArray(precio.articuloId, [...idDe.values(), "00000000-0000-0000-0000-000000000000"])))).map((p) => [p.articuloId, p]));

    await tx.update(listaPrecio).set({ vigente: false }).where(eq(listaPrecio.id, vigente.id));
    const [nueva] = await tx.insert(listaPrecio)
      .values({ origen: "edicion", descripcion: `Edición: ${cambios.length} precio(s), ${nuevosRecargos.length} recargo(s)`, vigente: true, creadoPor: actor.id })
      .returning({ id: listaPrecio.id, version: listaPrecio.version });

    // Copia en bloque de los precios no editados, luego los editados.
    const editados = [...idDe.values()];
    await tx.execute(sql`INSERT INTO precio (lista_id, articulo_id, costo_produccion, costo_materiales, costo_insumos, costos_generales, costo_total, margen, precio_neto)
      SELECT ${nueva.id}, articulo_id, costo_produccion, costo_materiales, costo_insumos, costos_generales, costo_total, margen, precio_neto
      FROM precio WHERE lista_id = ${vigente.id} ${editados.length ? sql`AND articulo_id NOT IN (${sql.join(editados.map((i) => sql`${i}`), sql`, `)})` : sql``}`);
    for (const c of cambios) {
      if (!(c.precioNeto > 0)) throw new ErrorDominio("VALIDACION", `Precio inválido para ${c.codigo}`);
      const id = idDe.get(c.codigo.toUpperCase())!;
      const ant = anteriores.get(id);
      const costo = ant?.costoTotal ? Number(ant.costoTotal) : null;
      await tx.insert(precio).values({
        listaId: nueva.id, articuloId: id, costoProduccion: ant?.costoProduccion, costoMateriales: ant?.costoMateriales, costoInsumos: ant?.costoInsumos,
        costosGenerales: ant?.costosGenerales, costoTotal: costo, margen: costo ? Number((c.precioNeto / costo - 1).toFixed(4)) : null, precioNeto: c.precioNeto,
      });
    }

    const tipos = new Map((await tx.select().from(tipoPuerta)).map((t) => [t.nombre, t.id]));
    const previos = await recargosDeTx(tx, vigente.id, tipos);
    for (const r of nuevosRecargos) {
      if (r.porcentaje < 0 || r.porcentaje >= 5) throw new ErrorDominio("VALIDACION", "Recargo fuera de rango");
      previos[r.tipo] = r.porcentaje;
    }
    await tx.insert(recargoTipo).values((Object.entries(previos) as [TipoRecargo, number][]).map(([t, p]) => ({
      listaId: nueva.id, tipoPuertaId: t === "ACCESORIOS" ? null : tipos.get(t)!, porcentaje: p,
    })));

    await registrarAuditoria(tx, {
      actor, accion: "nueva versión", recurso: "lista_precio", recursoId: nueva.id, resultado: "ok", origen: "web",
      antes: { version: vigente.version },
      despues: { version: nueva.version, cambios: cambios.map((c) => ({ codigo: c.codigo, antes: Number(anteriores.get(idDe.get(c.codigo.toUpperCase())!)?.precioNeto ?? 0), despues: c.precioNeto })), recargos: previos },
    });
    return { version: nueva.version };
  });
}

type TxLike = Parameters<Parameters<ReturnType<typeof bd>["transaction"]>[0]>[0];
async function recargosDeTx(tx: TxLike, listaId: string, tipos: Map<string, string>): Promise<Record<TipoRecargo, number>> {
  const r: Record<TipoRecargo, number> = { BLOQUE: 0, PANEL: 0, ESPECIAL: 0, ACCESORIOS: 0 };
  const nombre = new Map([...tipos].map(([n, id]) => [id, n]));
  for (const f of await tx.select().from(recargoTipo).where(eq(recargoTipo.listaId, listaId))) {
    r[(f.tipoPuertaId ? nombre.get(f.tipoPuertaId) : "ACCESORIOS") as TipoRecargo] = Number(f.porcentaje);
  }
  return r;
}
