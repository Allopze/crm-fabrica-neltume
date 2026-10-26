// Piezas compartidas de los PDF (ADR-0004; estilo común v1, ADR-0025): membrete, bloques de partes, tabla común con su plano,
// totales con notas, «Para fábrica», cajas, pie y marca de agua. Los colores, tamaños y medidas salen de los tokens (estilo.ts),
// iguales en las dos apps.
import { Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { LOGO } from "@/lib/logo-trazos";
import { type FilaTabla, type Parte } from "./contenido";
import { COLOR, MARCAS_DE_AGUA, MARGEN, mm, PLANO, rol, TRAZOS } from "./estilo";
import { Plano } from "./plano";

const BLANCO = "#ffffff";
/** Sin lineHeight en la página: el texto dinámico (render) de react-pdf no se dibuja con él (ver estilo.ts). */
const TEXTO = rol("texto", false);
/** El pie va a 8,5 mm del borde (dentro del margen inferior del estándar) y la página deja sitio para sus dos líneas más el número. */
const PIE_BAJO = 24;
const trazo = (nombre: keyof typeof TRAZOS) => ({ ancho: TRAZOS[nombre].anchoPt, color: COLOR[TRAZOS[nombre].color] });
const bajoCabecera = trazo("bajoEncabezado");
const bajoTabla = trazo("bajoEncabezadoTabla");
const entreFilas = trazo("entreFilas");
const sobreTotal = trazo("sobreTotal");
/** Anchos de las columnas fijas de la tabla, en puntos; «Producto» ocupa lo que sobra. */
const COL = { n: 22, plano: mm(PLANO.celdaMm), cantidad: 34, importe: 62, listo: 36 };

export const e = StyleSheet.create({
  // Sin ligaduras (fi, fl): con ellas el texto copiado o buscado en el PDF pierde letras («fete» en vez de «flete»).
  pagina: { ...TEXTO, paddingTop: MARGEN.arriba, paddingHorizontal: MARGEN.lateral, paddingBottom: PIE_BAJO + 44, fontFeatureSettings: { liga: false, clig: false } },
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
  cPlano: { width: COL.plano },
  cProducto: { flex: 1, paddingRight: 8 },
  cCantidad: { width: COL.cantidad, textAlign: "right", fontWeight: 600 },
  cImporte: { width: COL.importe, textAlign: "right" },
  cListo: { width: COL.listo, alignItems: "flex-end", textAlign: "right" },
  conMiniatura: { flexDirection: "row", alignItems: "center", gap: 8 },
  // La miniatura ocupa siempre su recuadro (10 × 12,5 mm), con o sin dibujo, para que los títulos queden alineados.
  miniatura: { width: mm(PLANO.miniaturaMm.ancho), height: mm(PLANO.miniaturaMm.alto), alignItems: "center", justifyContent: "center" },
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
  pie: { ...rol("pie"), position: "absolute", left: MARGEN.lateral, right: MARGEN.lateral, bottom: PIE_BAJO, borderTopWidth: 0.5, borderTopColor: entreFilas.color, paddingTop: 8, paddingRight: 80, lineHeight: 1.5 },
  // Texto dinámico (render): necesita su ancho (izquierda y derecha) y nada de lineHeight, con el que react-pdf no lo dibuja.
  numeroPagina: { ...rol("pie"), position: "absolute", left: MARGEN.lateral, right: MARGEN.lateral, bottom: PIE_BAJO, textAlign: "right" },
});

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

/** Celda de producto, de arriba abajo: título, medida solicitada, observación, detalle, «REVISAR» y la línea del código (en mono; «A pedido» no es un código). */
function Producto({ f }: { f: FilaTabla }) {
  return (
    <View>
      <Text style={e.titulo}>{f.titulo}</Text>
      {f.medida && <Text style={e.medida}>{f.medida}</Text>}
      {f.observacion && <Text style={e.detalle}>{f.observacion}</Text>}
      {f.detalle && <Text style={e.detalle}>{f.detalle}</Text>}
      {f.revisar && <Text style={e.revisar}>{f.revisar}</Text>}
      {f.codigo ? <Text style={e.codigo}>{f.codigo}</Text> : <Text style={e.referencia}>A pedido</Text>}
    </View>
  );
}

/**
 * Tabla común (estilo común v1 §5): N.º, «Plano» (dibujo con cotas, en nota y orden) o una miniatura junto al producto (cotización),
 * Producto, Cant., las columnas de importes y de stock de cada documento y, con `casilla`, «Listo».
 */
export function TablaItems({ columnas, filas, dibujos, casilla }: { columnas: string[]; filas: FilaTabla[]; dibujos: "plano" | "miniatura" | null; casilla?: boolean }) {
  return (
    <>
      <View style={e.encabezadoTabla}>
        <Text style={e.cN}>N.º</Text>
        {dibujos === "plano" && <Text style={e.cPlano}>Plano</Text>}
        <Text style={e.cProducto}>Producto</Text>
        <Text style={e.cCantidad}>Cant.</Text>
        {columnas.map((c) => <Text key={c} style={e.cImporte}>{c}</Text>)}
        {casilla && <Text style={e.cListo}>Listo</Text>}
      </View>
      {filas.map((f) => (
        <View key={f.n} style={e.fila} wrap={false}>
          <Text style={e.cN}>{f.n}</Text>
          {dibujos === "plano" && <View style={e.cPlano}>{f.dibujo && <Plano dibujo={f.dibujo} cotas={f.cotas} altoPt={mm(PLANO.alturaMm)} />}</View>}
          <View style={e.cProducto}>
            {dibujos === "miniatura"
              ? <View style={e.conMiniatura}><View style={e.miniatura}>{f.dibujo && <Plano dibujo={f.dibujo} cotas={null} altoPt={mm(PLANO.miniaturaMm.alto)} />}</View><Producto f={f} /></View>
              : <Producto f={f} />}
          </View>
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

/** «Para fábrica» (nota y orden): entrega comprometida sobre una línea, observaciones en un campo blanco y dos líneas de firma. */
export function ParaFabrica({ entrega, observaciones, firmas }: { entrega: string; observaciones: string | null; firmas: [string, string] }) {
  return (
    <View style={e.caja} wrap={false}>
      <Text style={e.tituloCaja}>Para fábrica</Text>
      <View style={e.entrega}><Text style={e.etiquetaCaja}>Entrega comprometida</Text><View style={e.lineaEntrega}><Text>{entrega}</Text></View></View>
      <Text style={[e.etiquetaCaja, { marginBottom: 4 }]}>Observaciones</Text>
      <View style={e.campo}>{porLineas(observaciones)}</View>
      <View style={e.firmas}>{firmas.map((f) => <Text key={f} style={e.firma}>{f}</Text>)}</View>
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
