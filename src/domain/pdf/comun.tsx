// Piezas compartidas de los PDF (ADR-0004): estilos, membrete y tabla de ítems. Fuentes estándar: sin red.
import { Circle, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { EMPRESA } from "./contenido";

const TINTA = "#1d2920";
export const TENUE = "#6b6b6b";
const RAULI = "#9a4524";

export const e = StyleSheet.create({
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

export function Membrete({ titulo, fechas }: { titulo: string; fechas: string }) {
  return (
    <>
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
export function TablaItems({ columnas, filas }: { columnas: [string, string, string, string, string]; filas: string[][] }) {
  return (
    <>
      <View style={e.encabezadoTabla}>
        <Text style={e.cCodigo}>{columnas[0]}</Text><Text style={e.cDesc}>{columnas[1]}</Text>
        {columnas.slice(2).map((c) => <Text key={c} style={e.cNum}>{c}</Text>)}
      </View>
      {filas.map((f, i) => (
        <View key={i} style={e.fila} wrap={false}>
          <Text style={e.cCodigo}>{f[0]}</Text><Text style={e.cDesc}>{f[1]}</Text>
          {f.slice(2).map((v, k) => <Text key={k} style={e.cNum}>{v}</Text>)}
        </View>
      ))}
    </>
  );
}

export function Totales({ lineas, total }: { lineas: [string, string][]; total: string }) {
  return (
    <View style={e.totales} wrap={false}>
      {lineas.map(([t, v]) => <View key={t} style={e.lineaTotal}><Text style={{ color: TENUE }}>{t}</Text><Text>{v}</Text></View>)}
      <View style={e.total}><Text>Total</Text><Text>{total}</Text></View>
    </View>
  );
}

export function Pie({ lineas }: { lineas: string[] }) {
  return <View style={e.pie} fixed>{lineas.map((p) => <Text key={p}>{p}</Text>)}</View>;
}
