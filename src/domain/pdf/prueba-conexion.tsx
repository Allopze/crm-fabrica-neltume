// PDF de la prueba de conexión con la tienda (ADR-0024 §5): una página rotulada como prueba, con datos inventados. Lo
// genera la app al apretar el botón y lo firma y envía el servicio de enlace; la tienda lo muestra en sus Ajustes.
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { MARCA } from "@/lib/marca";
import { Datos, e, Membrete, Pie, TablaItems, TENUE } from "./comun";
import { contenidoPruebaConexion, type PruebaConexionPdf } from "./contenido";

const RAULI = "#9a4524";

function DocumentoPrueba({ p }: { p: PruebaConexionPdf }) {
  const k = contenidoPruebaConexion(p);
  return (
    // Metadatos sin nada propio de la fábrica: solo el título (ADR-0024 §5).
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={p.creadaEn} modificationDate={p.creadaEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete titulo={k.titulo} fechas={k.fechas} />
        <View style={{ borderWidth: 1.2, borderColor: RAULI, paddingVertical: 12, marginBottom: 16 }}>
          <Text style={{ fontFamily: "Fraunces", fontSize: 16, textAlign: "center", color: RAULI }}>{k.rotulo}</Text>
        </View>
        <Datos pares={k.datos} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "En stock", "Por fabricar"]} filas={k.filas} />
        <View style={e.observaciones} wrap={false}>
          <Text style={{ fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: TENUE }}>Cómo reconocerlo</Text>
          <Text style={{ marginTop: 4 }}>{k.nota}</Text>
        </View>
        <Pie lineas={k.pie} />
      </Page>
    </Document>
  );
}

export const pdfPruebaConexion = (p: PruebaConexionPdf): Promise<Buffer> => renderToBuffer(<DocumentoPrueba p={p} />);
