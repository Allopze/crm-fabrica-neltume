// Piezas compartidas de los PDF (ADR-0004; estilo común v1, ADR-0025): membrete, bloques de partes, tabla de ítems, totales,
// cajas, pie y marca de agua. Los colores, tamaños y márgenes salen de los tokens (estilo.ts), iguales en las dos apps.
import { Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { LOGO } from "@/lib/logo-trazos";
import { datosEmpresa } from "@/lib/marca";
import { lineasEmpresa, type Parte } from "./contenido";
import { COLOR, MARCAS_DE_AGUA, MARGEN, rol, TRAZOS } from "./estilo";

const BLANCO = "#ffffff";
/** Sin lineHeight en la página: el texto dinámico (render) de react-pdf no se dibuja con él (ver estilo.ts). */
const TEXTO = rol("texto", false);
/** El pie va a 8,5 mm del borde (dentro del margen inferior del estándar) y la página deja sitio para hasta cinco líneas. */
const PIE_BAJO = 24;
const trazo = (nombre: keyof typeof TRAZOS) => ({ ancho: TRAZOS[nombre].anchoPt, color: COLOR[TRAZOS[nombre].color] });
const bajoCabecera = trazo("bajoEncabezado");
const bajoTabla = trazo("bajoEncabezadoTabla");
const entreFilas = trazo("entreFilas");
const sobreTotal = trazo("sobreTotal");

export const e = StyleSheet.create({
  // Sin ligaduras (fi, fl): con ellas el texto copiado o buscado en el PDF pierde letras («fete» en vez de «flete»).
  pagina: { ...TEXTO, paddingTop: MARGEN.arriba, paddingHorizontal: MARGEN.lateral, paddingBottom: PIE_BAJO + 68, fontFeatureSettings: { liga: false, clig: false } },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  marca: { flexDirection: "column", gap: 8 },
  empresa: { fontSize: 7.5, color: COLOR.gris, lineHeight: 1.45 },
  empresaNombre: { fontWeight: 600, color: COLOR.tinta },
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
  fila: { flexDirection: "row", borderBottomWidth: entreFilas.ancho, borderBottomColor: entreFilas.color, paddingVertical: 6 },
  cCodigo: { width: "16%" },
  codigo: rol("codigoTabla"),
  cDesc: { width: "45%" },
  cNum: { width: "13%", textAlign: "right" },
  cListo: { width: "8%", paddingLeft: 10, alignItems: "flex-end", textAlign: "right" },
  casilla: { width: 8, height: 8, borderWidth: 0.8, borderColor: COLOR.tinta },
  caja: { marginTop: 18, backgroundColor: COLOR.fondoSuave, padding: 10 },
  tituloCaja: { ...rol("tituloCaja"), marginBottom: 6 },
  campo: { backgroundColor: BLANCO, borderWidth: 0.5, borderColor: COLOR.gris, padding: 8, minHeight: 44 },
  totales: { marginTop: 16, marginLeft: "auto", width: 220 },
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
 * Encabezado: el logo de la app a la izquierda (con los datos de la empresa más abajo que el número) y, a la derecha, el tipo
 * del documento sobre su número y la meta en columnas con la etiqueta arriba. Cierra con un filete verde.
 */
export function Membrete({ tipo, numero, meta }: { tipo: string; numero: string; meta: [string, string][] }) {
  const [nombre, ...resto] = lineasEmpresa(datosEmpresa());
  return (
    <>
      <View style={e.cabecera}>
        <View style={e.marca}>
          <Svg width={68} height={64} viewBox={LOGO.viewBox}>
            {LOGO.trazos.map((d, i) => <Path key={i} d={d} fill={COLOR.tinta} fillRule={LOGO.relleno} />)}
            {LOGO.rects.map(([x, y, w, h], i) => <Rect key={`r${i}`} x={x} y={y} width={w} height={h} fill={COLOR.tinta} />)}
          </Svg>
          <View style={e.empresa}>
            <Text style={e.empresaNombre}>{nombre}</Text>
            {resto.map((l) => <Text key={l}>{l}</Text>)}
          </View>
        </View>
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

/** Tabla de 5 columnas (código en monoespaciada; las tres últimas a la derecha). Con `casilla`, una columna «Listo» para marcar a mano. */
export function TablaItems({ columnas, filas, casilla }: { columnas: [string, string, string, string, string]; filas: string[][]; casilla?: boolean }) {
  const desc = casilla ? { ...e.cDesc, width: "37%" } : e.cDesc;
  return (
    <>
      <View style={e.encabezadoTabla}>
        <Text style={e.cCodigo}>{columnas[0]}</Text><Text style={desc}>{columnas[1]}</Text>
        {columnas.slice(2).map((c) => <Text key={c} style={e.cNum}>{c}</Text>)}
        {casilla && <Text style={e.cListo}>Listo</Text>}
      </View>
      {filas.map((f, i) => (
        <View key={i} style={e.fila} wrap={false}>
          {/* «A pedido» no es un código: va en la fuente del texto, no en la monoespaciada. */}
          <Text style={f[0] === "A pedido" ? e.cCodigo : [e.cCodigo, e.codigo]}>{f[0]}</Text>
          {/* Una línea por Text: un salto («\n») dentro del texto hace que react-pdf cite Helvetica, que no va incrustada. */}
          <View style={desc}>{f[1].split("\n").map((linea, k) => <Text key={k}>{linea}</Text>)}</View>
          {f.slice(2).map((v, k) => <Text key={k} style={e.cNum}>{v}</Text>)}
          {casilla && <View style={e.cListo}><View style={e.casilla} /></View>}
        </View>
      ))}
    </>
  );
}

export function Totales({ lineas, total, despues = [] }: { lineas: [string, string][]; total: string; despues?: [string, string][] }) {
  return (
    <View style={e.totales} wrap={false}>
      {lineas.map(([t, v]) => <View key={t} style={e.lineaTotal}><Text style={e.gris}>{t}</Text><Text>{v}</Text></View>)}
      <View style={e.total}><Text style={e.etiquetaTotal}>Total</Text><Text style={e.cifraTotal}>{total}</Text></View>
      {despues.map(([t, v], i) => <View key={t} style={[e.lineaTotal, i === 0 ? { marginTop: 6 } : {}]}><Text style={e.gris}>{t}</Text><Text>{v}</Text></View>)}
    </View>
  );
}

/** Caja sobre fondo suave con un título serif; con `campo`, el texto va en un cuadro blanco con borde gris para escribir a mano. */
export function Caja({ titulo, texto, campo = false }: { titulo: string; texto: string | null; campo?: boolean }) {
  const contenido = <Text>{texto ?? ""}</Text>;
  return (
    <View style={e.caja} wrap={false}>
      <Text style={e.tituloCaja}>{titulo}</Text>
      {campo ? <View style={e.campo}>{contenido}</View> : contenido}
    </View>
  );
}

/** Pie fijo en cada página: las notas y «Página N de M» (un documento largo se puede ordenar al imprimirlo). */
export function Pie({ lineas }: { lineas: string[] }) {
  return (
    <>
      <View style={e.pie} fixed>{lineas.map((p) => <Text key={p}>{p}</Text>)}</View>
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
