// PDF de cotización con @react-pdf/renderer desde los datos congelados (ADR-0004). Fuentes estándar: sin red.
import { Circle, Document, Page, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { inArray } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { obtenerCotizacion } from "../cotizaciones/consulta";
import { ErrorDominio } from "../errores";
import { type CotizacionPdf, contenidoCotizacion, EMPRESA } from "./contenido";

const TINTA = "#1d2920";
const TENUE = "#6b6b6b";
const RAULI = "#9a4524";

const e = StyleSheet.create({
  pagina: { paddingVertical: 48, paddingHorizontal: 52, fontFamily: "Helvetica", fontSize: 9.5, color: "#222" },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  marca: { flexDirection: "row", alignItems: "center", gap: 10 },
  nombre: { fontFamily: "Times-Roman", fontSize: 22, color: TINTA },
  bajada: { fontSize: 7, letterSpacing: 1.6, color: TENUE, marginTop: 3, textTransform: "uppercase" },
  titulo: { fontFamily: "Times-Roman", fontSize: 16, textAlign: "right" },
  fechas: { color: TENUE, marginTop: 4, textAlign: "right" },
  regla: { height: 1.2, backgroundColor: RAULI, marginVertical: 20, opacity: 0.6 },
  datos: { flexDirection: "row", flexWrap: "wrap", rowGap: 5 },
  dato: { width: "50%", flexDirection: "row" },
  etiqueta: { width: 58, color: TENUE },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 6 },
  encabezadoTabla: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#222", paddingVertical: 5, marginTop: 24, fontSize: 7, letterSpacing: 1, textTransform: "uppercase" },
  cCodigo: { width: "16%", fontFamily: "Courier", fontSize: 8.5 },
  cDesc: { width: "42%" },
  cNum: { width: "14%", textAlign: "right" },
  totales: { marginTop: 16, marginLeft: "auto", width: 210 },
  lineaTotal: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#222", paddingTop: 6, fontFamily: "Times-Roman", fontSize: 14 },
  pie: { position: "absolute", left: 52, right: 52, bottom: 40, borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 8, fontSize: 8, color: TENUE, lineHeight: 1.5 },
});

function DocumentoCotizacion({ c }: { c: CotizacionPdf }) {
  const k = contenidoCotizacion(c);
  return (
    <Document title={k.titulo} author={EMPRESA.nombre} creator={EMPRESA.nombre} producer={EMPRESA.nombre} creationDate={c.aprobadaEn} modificationDate={c.aprobadaEn}>
      <Page size="A4" style={e.pagina}>
        <View style={e.cabecera}>
          <View style={e.marca}>
            <Svg width={24} height={34} viewBox="0 0 28 40">
              <Rect x={1} y={1} width={26} height={38} rx={1.5} stroke={TINTA} strokeWidth={1.6} fill="none" />
              <Rect x={5} y={5} width={18} height={13} stroke={TINTA} strokeWidth={1} fill="none" />
              <Rect x={5} y={21} width={18} height={14} stroke={TINTA} strokeWidth={1} fill="none" />
              <Circle cx={22.5} cy={20} r={1.3} fill={RAULI} />
            </Svg>
            <View><Text style={e.nombre}>{EMPRESA.nombre}</Text><Text style={e.bajada}>{EMPRESA.bajada} · {EMPRESA.contacto}</Text></View>
          </View>
          <View><Text style={e.titulo}>{k.titulo}</Text><Text style={e.fechas}>{k.fechas}</Text></View>
        </View>
        <View style={e.regla} />
        {k.cliente && (
          <View style={e.datos}>
            {k.cliente.map(([t, v]) => <View key={t} style={e.dato}><Text style={e.etiqueta}>{t}</Text><Text>{v}</Text></View>)}
          </View>
        )}
        <View style={e.encabezadoTabla}>
          <Text style={e.cCodigo}>Código</Text><Text style={e.cDesc}>Descripción</Text>
          <Text style={e.cNum}>Cant.</Text><Text style={e.cNum}>Precio unit.</Text><Text style={e.cNum}>Total</Text>
        </View>
        {k.lineas.map((l, i) => (
          <View key={i} style={e.fila} wrap={false}>
            <Text style={e.cCodigo}>{l.codigo}</Text><Text style={e.cDesc}>{l.descripcion}</Text>
            <Text style={e.cNum}>{l.cantidad}</Text><Text style={e.cNum}>{l.unitario}</Text><Text style={e.cNum}>{l.total}</Text>
          </View>
        ))}
        <View style={e.totales} wrap={false}>
          {k.totales.map(([t, v]) => <View key={t} style={e.lineaTotal}><Text style={{ color: TENUE }}>{t}</Text><Text>{v}</Text></View>)}
          <View style={e.total}><Text>Total</Text><Text>{k.total}</Text></View>
        </View>
        <View style={e.pie} fixed>{k.pie.map((p) => <Text key={p}>{p}</Text>)}</View>
      </Page>
    </Document>
  );
}

export const renderizarCotizacion = (c: CotizacionPdf) => renderToBuffer(<DocumentoCotizacion c={c} />);

/** Lee la cotización congelada y la convierte en PDF. 409 NO_APROBADA si no está aprobada (REQ-COT-4.3). */
export async function pdfCotizacion(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const c = await obtenerCotizacion(tx, id, true);
  if (c.estado !== "aprobada" && c.estado !== "aceptada") throw new ErrorDominio("NO_APROBADA", "Solo una cotización aprobada tiene PDF.");
  const ids = c.items.flatMap((i) => (i.articuloId ? [i.articuloId] : []));
  const codigos = new Map(ids.length ? (await tx.select({ id: articulo.id, codigo: articulo.codigo }).from(articulo).where(inArray(articulo.id, ids))).map((a) => [a.id, a.codigo]) : []);
  const datos: CotizacionPdf = {
    numero: c.numero, aprobadaEn: c.aprobadaEn!, vigenciaHasta: c.vigenciaHasta!, listaVersion: c.lista.usada,
    cliente: c.cliente && { nombre: c.cliente.nombre, rut: c.cliente.rut ?? null, comuna: c.cliente.comuna ?? null, contacto: c.cliente.contacto ?? null },
    items: c.items.map((i) => ({ codigo: i.articuloId ? codigos.get(i.articuloId) ?? null : null, descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: Number(i.precioUnitario), totalLinea: Number(i.totalLinea) })),
    subtotal: Number(c.subtotal), descuento: Number(c.descuento), descuentoMotivo: c.descuentoMotivo, iva: Number(c.iva), total: Number(c.total),
  };
  return { numero: c.numero, pdf: await renderizarCotizacion(datos) };
}
