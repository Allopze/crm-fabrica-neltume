// Piezas compartidas de los PDF (ADR-0004; estilo común v1, ADR-0025): membrete, bloques de partes, tabla común (solo texto),
// totales con notas, «Para fábrica» con las imágenes de referencia, cajas, pie y marca de agua. Los colores, tamaños y medidas salen de los tokens (estilo.ts),
// iguales en las dos apps.
import { type DocumentProps, Image, Path, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { LOGO } from "@/lib/logo-trazos";
import { type FilaTabla, type GrupoImagenes, type Parte } from "./contenido";
import { COLOR, IMAGENES, MARCAS_DE_AGUA, MARGEN, mm, prepararFuentes, rol, TRAZOS } from "./estilo";
import type { ImagenPdf } from "./referencias";

const BLANCO = "#ffffff";
/** Sin lineHeight en la página: el texto dinámico (render) de react-pdf no se dibuja con él (ver estilo.ts). */
const TEXTO = rol("texto", false);
/**
 * El pie, sin filete, deja su línea base a 6 mm del borde inferior de la hoja, como el de la tienda (en react-pdf, 15 pt
 * desde el borde dejan la línea base a 16,9 pt). El cuerpo respeta el margen inferior del estándar, que sobra para dos líneas.
 */
const PIE_BAJO = 15;
const trazo = (nombre: keyof typeof TRAZOS) => ({ ancho: TRAZOS[nombre].anchoPt, color: COLOR[TRAZOS[nombre].color] });
const bajoCabecera = trazo("bajoEncabezado");
const bajoTabla = trazo("bajoEncabezadoTabla");
const entreFilas = trazo("entreFilas");
const sobreTotal = trazo("sobreTotal");
/** Anchos de las columnas fijas de la tabla, en puntos; «Producto» ocupa lo que sobra. */
const COL = { n: 22, cantidad: 34, importe: 62, listo: 36 };

export const e = StyleSheet.create({
  // Sin ligaduras (fi, fl): con ellas el texto copiado o buscado en el PDF pierde letras («fete» en vez de «flete»).
  pagina: { ...TEXTO, paddingTop: MARGEN.arriba, paddingHorizontal: MARGEN.lateral, paddingBottom: MARGEN.abajo, fontFeatureSettings: { liga: false, clig: false } },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tipo: { ...rol("tipoDocumento"), textAlign: "right" },
  numero: { ...rol("numeroDocumento"), textAlign: "right", marginTop: 2 },
  meta: { flexDirection: "row", justifyContent: "flex-end", gap: 18, marginTop: 10 },
  metaColumna: { alignItems: "flex-end" },
  etiqueta: rol("etiqueta"),
  valorMeta: rol("valorMeta"),
  regla: { height: bajoCabecera.ancho, backgroundColor: bajoCabecera.color, marginTop: 16, marginBottom: 18 },
  partes: { flexDirection: "row", gap: 24 },
  parte: { flex: 1 },
  tituloBloque: { ...rol("tituloBloque"), marginTop: 2, marginBottom: 5 },
  par: { flexDirection: "row", marginBottom: 2.5 },
  parClave: { width: 58, color: COLOR.gris },
  encabezadoTabla: { ...rol("encabezadoTabla"), flexDirection: "row", borderBottomWidth: bajoTabla.ancho, borderBottomColor: bajoTabla.color, paddingBottom: 4, marginTop: 22 },
  fila: { flexDirection: "row", alignItems: "center", borderBottomWidth: entreFilas.ancho, borderBottomColor: entreFilas.color, paddingVertical: 6 },
  cN: { width: COL.n, color: COLOR.gris },
  cProducto: { flex: 1, paddingRight: 8 },
  cCantidad: { width: COL.cantidad, textAlign: "right", fontWeight: 600 },
  cImporte: { width: COL.importe, textAlign: "right" },
  cListo: { width: COL.listo, alignItems: "flex-end", textAlign: "right" },
  titulo: rol("productoTitulo"),
  medida: { ...rol("productoMedida"), marginTop: 1.5 },
  detalle: { ...rol("productoDetalle"), marginTop: 1.5 },
  revisar: { ...rol("productoMedida"), color: COLOR.acento, marginTop: 1.5 },
  referencia: { ...rol("productoReferencia"), marginTop: 2 },
  codigo: { ...rol("codigoTabla"), marginTop: 2 },
  casilla: { width: 8, height: 8, borderWidth: 0.8, borderColor: COLOR.tinta },
  caja: { marginTop: 18, backgroundColor: COLOR.fondoSuave, padding: 10 },
  tituloCaja: { ...rol("tituloCaja"), marginBottom: 6 },
  campo: { backgroundColor: BLANCO, borderWidth: 0.5, borderColor: COLOR.gris, padding: 8, minHeight: 44 },
  grupo: { marginTop: 8 },
  tituloGrupo: { ...rol("productoReferencia"), marginBottom: 3 },
  imagenes: { flexDirection: "row", flexWrap: "wrap", gap: mm(IMAGENES.separacionMm) },
  etiquetaCaja: { fontWeight: 600 },
  entrega: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  lineaEntrega: { flex: 1, borderBottomWidth: 0.8, borderBottomColor: COLOR.tinta, paddingBottom: 1.5 },
  firmas: { flexDirection: "row", gap: 28, marginTop: 30 },
  firma: { flex: 1, borderTopWidth: 0.8, borderTopColor: COLOR.tinta, paddingTop: 3, ...rol("firma") },
  zonaTotales: { flexDirection: "row", marginTop: 16 },
  notas: { flex: 1, paddingRight: 24, gap: 5, ...rol("productoDetalle") },
  notasSolas: { marginTop: 16, gap: 5, ...rol("productoDetalle") },
  totales: { width: 220 },
  lineaTotal: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: sobreTotal.ancho, borderTopColor: sobreTotal.color, paddingTop: 6 },
  etiquetaTotal: rol("etiquetaTotal"),
  cifraTotal: rol("cifraTotal"),
  gris: { color: COLOR.gris },
  // Ni filete ni lineHeight: el texto de la empresa y «Página n de m» se apoyan en el mismo borde y comparten línea base.
  pie: { ...rol("pie"), position: "absolute", left: MARGEN.lateral, right: MARGEN.lateral, bottom: PIE_BAJO, paddingRight: 80 },
  // Texto dinámico (render): necesita su ancho (izquierda y derecha) y nada de lineHeight, con el que react-pdf no lo dibuja.
  numeroPagina: { ...rol("pie"), position: "absolute", left: MARGEN.lateral, right: MARGEN.lateral, bottom: PIE_BAJO, textAlign: "right" },
});

/** El PDF de un documento, con las fuentes ya preparadas (ver `prepararFuentes`). */
export async function renderizarPdf(documento: ReactElement<DocumentProps>): Promise<Buffer> {
  await prepararFuentes();
  return renderToBuffer(documento);
}

/**
 * Encabezado: solo el logo de la app a la izquierda y, a la derecha, el tipo del documento sobre su número y la meta en
 * columnas con la etiqueta arriba. Cierra con un filete en el color de acento. Los datos de la empresa van en el pie.
 */
export function Membrete({ tipo, numero, meta }: { tipo: string; numero: string; meta: [string, string][] }) {
  return (
    <>
      <View style={e.cabecera}>
        <Svg width={68} height={64} viewBox={LOGO.viewBox}>
          {LOGO.trazos.map((d, i) => <Path key={i} d={d} fill={COLOR.tinta} fillRule={LOGO.relleno} />)}
          {LOGO.rects.map(([x, y, w, h], i) => <Rect key={`r${i}`} x={x} y={y} width={w} height={h} fill={COLOR.tinta} />)}
        </Svg>
        <View>
          <Text style={e.tipo}>{tipo}</Text>
          <Text style={e.numero}>{numero}</Text>
          <View style={e.meta}>
            {meta.map(([etiqueta, valor]) => (
              <View key={etiqueta} style={e.metaColumna}><Text style={e.etiqueta}>{etiqueta}</Text><Text style={e.valorMeta}>{valor}</Text></View>
            ))}
          </View>
        </View>
      </View>
      <View style={e.regla} />
    </>
  );
}

/** Bloques de partes (Cliente, Obra, Despacho…): etiqueta chica, título serif y debajo los datos como pares clave-valor. */
export function Partes({ partes }: { partes: Parte[] }) {
  return (
    <View style={e.partes}>
      {partes.map((p) => (
        <View key={p.etiqueta} style={e.parte}>
          <Text style={e.etiqueta}>{p.etiqueta}</Text>
          <Text style={e.tituloBloque}>{p.titulo}</Text>
          {p.pares.map(([clave, valor]) => <View key={clave} style={e.par}><Text style={e.parClave}>{clave}</Text><Text>{valor}</Text></View>)}
        </View>
      ))}
    </View>
  );
}

/**
 * Celda de producto, de arriba abajo: título, medida solicitada, observación, «REVISAR», los adjuntos nombrados (sobre la línea
 * del código, estilo común v1 §5) y la línea del código (en mono; «A pedido» no es un código).
 */
function Producto({ f }: { f: FilaTabla }) {
  return (
    <View>
      <Text style={e.titulo}>{f.titulo}</Text>
      {f.medida && <Text style={e.medida}>{f.medida}</Text>}
      {f.observacion && <Text style={e.detalle}>{f.observacion}</Text>}
      {f.revisar && <Text style={e.revisar}>{f.revisar}</Text>}
      {f.detalle && <Text style={e.detalle}>{f.detalle}</Text>}
      {f.codigo ? <Text style={e.codigo}>{f.codigo}</Text> : <Text style={e.referencia}>A pedido</Text>}
    </View>
  );
}

/**
 * Tabla común (estilo común v1 §5), solo texto: N.º, Producto, Cant., las columnas de importes y de stock de cada documento y,
 * con `casilla`, «Listo». Sin dibujos del catálogo (ADR-0025 D14).
 */
export function TablaItems({ columnas, filas, casilla }: { columnas: string[]; filas: FilaTabla[]; casilla?: boolean }) {
  return (
    <>
      <View style={e.encabezadoTabla}>
        <Text style={e.cN}>N.º</Text>
        <Text style={e.cProducto}>Producto</Text>
        <Text style={e.cCantidad}>Cant.</Text>
        {columnas.map((c) => <Text key={c} style={e.cImporte}>{c}</Text>)}
        {casilla && <Text style={e.cListo}>Listo</Text>}
      </View>
      {filas.map((f) => (
        <View key={f.n} style={e.fila} wrap={false}>
          <Text style={e.cN}>{f.n}</Text>
          <View style={e.cProducto}><Producto f={f} /></View>
          <Text style={e.cCantidad}>{f.cantidad}</Text>
          {f.importes.map((v, k) => <Text key={k} style={[e.cImporte, columnas[k] === "Total" ? { fontWeight: 600 } : {}]}>{v}</Text>)}
          {casilla && <View style={e.cListo}><View style={e.casilla} /></View>}
        </View>
      ))}
    </>
  );
}

/** Totales a la derecha y, a su izquierda y a su altura, las notas del documento (estilo común v1 §5). */
export function ZonaTotales({ notas, lineas: filas, total, despues = [] }: { notas: string[]; lineas: [string, string][]; total: string; despues?: [string, string][] }) {
  return (
    <View style={e.zonaTotales} wrap={false}>
      <View style={e.notas}>{notas.map((n) => <Text key={n}>{n}</Text>)}</View>
      <View style={e.totales}>
        {filas.map(([t, v]) => <View key={t} style={e.lineaTotal}><Text style={e.gris}>{t}</Text><Text>{v}</Text></View>)}
        <View style={e.total}><Text style={e.etiquetaTotal}>Total</Text><Text style={e.cifraTotal}>{total}</Text></View>
        {despues.map(([t, v], i) => <View key={t} style={[e.lineaTotal, i === 0 ? { marginTop: 6 } : {}]}><Text style={e.gris}>{t}</Text><Text>{v}</Text></View>)}
      </View>
    </View>
  );
}

/** Notas del documento a ancho completo, cuando no hay totales junto a los que ponerlas (orden de trabajo y prueba). */
export function Notas({ notas }: { notas: string[] }) {
  return <View style={e.notasSolas} wrap={false}>{notas.map((n) => <Text key={n}>{n}</Text>)}</View>;
}

/** Una línea por Text: un salto («\n») dentro del texto hace que react-pdf cite Helvetica, que no va incrustada. */
const porLineas = (texto: string | null) => (texto ?? "").split("\n").map((linea, k) => <Text key={k}>{linea}</Text>);

/** Caja sobre fondo suave con un título serif y un texto (la prueba de conexión). */
export function Caja({ titulo, texto }: { titulo: string; texto: string }) {
  return <View style={e.caja} wrap={false}><Text style={e.tituloCaja}>{titulo}</Text>{porLineas(texto)}</View>;
}

/** Imagen dentro de 40 × 58 mm como máximo, con su proporción (tokens `imagenesReferencia`). */
function Imagen({ imagen }: { imagen: ImagenPdf }) {
  const k = Math.min(mm(IMAGENES.anchoMaxMm) / imagen.ancho, mm(IMAGENES.altoMaxMm) / imagen.alto);
  // Es la imagen de un PDF (react-pdf), no un <img>: no tiene atributo alt.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image src={{ data: imagen.data, format: "jpg" }} style={{ width: imagen.ancho * k, height: imagen.alto * k }} />;
}

/**
 * «Para fábrica» (nota y orden): entrega comprometida sobre una línea, observaciones en un campo blanco y dos líneas de firma.
 * Las imágenes de referencia van en las observaciones, después del texto, un grupo por ítem que no se parte entre páginas;
 * con imágenes el bloque puede seguir en la página siguiente (estilo común v1 §5).
 */
export function ParaFabrica({ entrega, observaciones, firmas, imagenes = [] }: { entrega: string; observaciones: string | null; firmas: [string, string]; imagenes?: GrupoImagenes[] }) {
  return (
    <View style={e.caja} wrap={imagenes.length > 0}>
      <View wrap={false}>
        <Text style={e.tituloCaja}>Para fábrica</Text>
        <View style={e.entrega}><Text style={e.etiquetaCaja}>Entrega comprometida</Text><View style={e.lineaEntrega}><Text>{entrega}</Text></View></View>
        <Text style={[e.etiquetaCaja, { marginBottom: 4 }]}>Observaciones</Text>
      </View>
      <View style={e.campo}>
        {porLineas(observaciones)}
        {imagenes.map((g) => (
          <View key={g.titulo} style={e.grupo} wrap={false}>
            <Text style={e.tituloGrupo}>{g.titulo}</Text>
            <View style={e.imagenes}>{g.imagenes.map((im, k) => <Imagen key={k} imagen={im} />)}</View>
          </View>
        ))}
      </View>
      <View style={e.firmas} wrap={false}>{firmas.map((f) => <Text key={f} style={e.firma}>{f}</Text>)}</View>
    </View>
  );
}

/** Pie fijo en cada página: los datos de la empresa y «Página N de M» (un documento largo se puede ordenar al imprimirlo). */
export function Pie({ lineas: textos }: { lineas: string[] }) {
  return (
    <>
      <View style={e.pie} fixed>{textos.map((p) => <Text key={p}>{p}</Text>)}</View>
      <Text style={e.numeroPagina} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </>
  );
}

/** Marca de agua diagonal, muy tenue, sobre el contenido de cada página («ANULADA» o «PRUEBA»; tokens `marcasDeAgua`). */
export function MarcaDeAgua({ texto }: { texto: keyof typeof MARCAS_DE_AGUA }) {
  const m = MARCAS_DE_AGUA[texto];
  return (
    <View fixed style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", transform: `rotate(${m.giroGrados}deg)` }}>
      <Text style={{ fontFamily: m.familia, fontWeight: m.peso, fontSize: 96, color: COLOR[m.color], opacity: m.opacidad }}>{texto}</Text>
    </View>
  );
}
