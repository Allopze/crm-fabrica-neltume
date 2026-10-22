// Piezas compartidas de los PDF (ADR-0004): estilos, membrete y tabla de ítems. Las fuentes de la marca van en la
// imagen (public/marca/fuentes, licencia OFL): el PDF se ve como la app y no se piden por red.
import path from "node:path";
import { Font, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { LOGO } from "@/lib/logo-trazos";
import { datosEmpresa } from "@/lib/marca";
import { lineasEmpresa } from "./contenido";

const FUENTES = path.join(process.cwd(), "public/marca/fuentes");
Font.register({ family: "Fraunces", src: path.join(FUENTES, "fraunces-latin-500-normal.woff") });
Font.register({ family: "Instrument Sans", fonts: [
  { src: path.join(FUENTES, "instrument-sans-latin-400-normal.woff") },
  { src: path.join(FUENTES, "instrument-sans-latin-600-normal.woff"), fontWeight: 600 },
] });
Font.register({ family: "JetBrains Mono", src: path.join(FUENTES, "jetbrains-mono-latin-400-normal.woff") });
// Sin guiones de partición: las reglas por defecto son del inglés y cortarían mal palabras en español.
Font.registerHyphenationCallback((palabra) => [palabra]);

const TINTA = "#1d2920";
export const TENUE = "#62645c";
const RAULI = "#9a4524";

export const e = StyleSheet.create({
  // Sin ligaduras (fi, fl): con ellas el texto copiado o buscado en el PDF pierde letras («fete» en vez de «flete»).
  pagina: { paddingTop: 48, paddingBottom: 88, paddingHorizontal: 52, fontFamily: "Instrument Sans", fontSize: 9.5, color: TINTA, fontFeatureSettings: { liga: false, clig: false } },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  marca: { flexDirection: "column", gap: 8 },
  empresa: { fontSize: 7.5, color: TENUE, lineHeight: 1.45 },
  empresaNombre: { fontWeight: 600, color: TINTA },
  titulo: { fontFamily: "Fraunces", fontSize: 18, textAlign: "right" },
  fechas: { color: TENUE, marginTop: 4, textAlign: "right" },
  regla: { height: 1.2, backgroundColor: RAULI, marginVertical: 20, opacity: 0.6 },
  datos: { flexDirection: "row", flexWrap: "wrap", rowGap: 5 },
  dato: { width: "50%", flexDirection: "row" },
  etiqueta: { width: 58, color: TENUE },
  fila: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 6 },
  encabezadoTabla: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#222", paddingVertical: 5, marginTop: 24, fontSize: 7, letterSpacing: 1, textTransform: "uppercase" },
  cCodigo: { width: "16%", fontFamily: "JetBrains Mono", fontSize: 8 },
  cDesc: { width: "42%" },
  cNum: { width: "14%", textAlign: "right" },
  cListo: { width: "8%", paddingLeft: 10, alignItems: "flex-end", textAlign: "right" },
  casilla: { width: 8, height: 8, borderWidth: 0.8, borderColor: "#222" },
  observaciones: { marginTop: 18, borderWidth: 0.5, borderColor: "#bbb", padding: 8, minHeight: 44 },
  totales: { marginTop: 16, marginLeft: "auto", width: 210 },
  lineaTotal: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#222", paddingTop: 6, fontFamily: "Fraunces", fontSize: 15 },
  pie: { position: "absolute", left: 52, right: 52, bottom: 32, borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 8, paddingRight: 80, fontSize: 8, color: TENUE, lineHeight: 1.5 },
  // Texto dinámico (render): necesita su ancho (izquierda y derecha) y nada de lineHeight, con el que react-pdf no lo dibuja.
  numeroPagina: { position: "absolute", left: 52, right: 52, bottom: 32, textAlign: "right", fontSize: 8, color: TENUE },
});

/** Logo oficial «Puertas Neltume» (public/marca/logo-neltume.svg) y datos de la empresa configurados. */
export function Membrete({ titulo, fechas }: { titulo: string; fechas: string }) {
  const [nombre, ...resto] = lineasEmpresa(datosEmpresa());
  return (
    <>
      <View style={e.cabecera}>
        <View style={e.marca}>
          <Svg width={68} height={64} viewBox={LOGO.viewBox}>
            {LOGO.trazos.map((d, i) => <Path key={i} d={d} fill={TINTA} fillRule={LOGO.relleno} />)}
            {LOGO.rects.map(([x, y, w, h], i) => <Rect key={`r${i}`} x={x} y={y} width={w} height={h} fill={TINTA} />)}
          </Svg>
          <View style={e.empresa}>
            <Text style={e.empresaNombre}>{nombre}</Text>
            {resto.map((l) => <Text key={l}>{l}</Text>)}
          </View>
        </View>
        <View><Text style={e.titulo}>{titulo}</Text><Text style={e.fechas}>{fechas}</Text></View>
      </View>
      <View style={e.regla} />
    </>
  );
}

export function Datos({ pares }: { pares: [string, string][] }) {
  return <View style={e.datos}>{pares.map(([t, v]) => <View key={t} style={e.dato}><Text style={e.etiqueta}>{t}</Text><Text>{v}</Text></View>)}</View>;
}

/** Tabla de 5 columnas: la primera en monoespaciada (código) y las tres últimas alineadas a la derecha. */
/** Tabla de 5 columnas (código monoespaciado; las tres últimas a la derecha). Con `casilla`, una columna «Listo» para marcar a mano. */
export function TablaItems({ columnas, filas, casilla }: { columnas: [string, string, string, string, string]; filas: string[][]; casilla?: boolean }) {
  const desc = casilla ? { ...e.cDesc, width: "34%" } : e.cDesc;
  return (
    <>
      <View style={e.encabezadoTabla}>
        <Text style={e.cCodigo}>{columnas[0]}</Text><Text style={desc}>{columnas[1]}</Text>
        {columnas.slice(2).map((c) => <Text key={c} style={e.cNum}>{c}</Text>)}
        {casilla && <Text style={e.cListo}>Listo</Text>}
      </View>
      {filas.map((f, i) => (
        <View key={i} style={e.fila} wrap={false}>
          <Text style={e.cCodigo}>{f[0]}</Text><Text style={desc}>{f[1]}</Text>
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
      {lineas.map(([t, v]) => <View key={t} style={e.lineaTotal}><Text style={{ color: TENUE }}>{t}</Text><Text>{v}</Text></View>)}
      <View style={e.total}><Text>Total</Text><Text>{total}</Text></View>
      {despues.map(([t, v], i) => <View key={t} style={[e.lineaTotal, i === 0 ? { marginTop: 6 } : {}]}><Text style={{ color: TENUE }}>{t}</Text><Text>{v}</Text></View>)}
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
