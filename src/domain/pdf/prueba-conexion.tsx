// PDF de la prueba de conexión con la tienda (ADR-0024 §5): una página rotulada como prueba, con datos inventados. Lo
// genera la app al apretar el botón y lo firma y envía el servicio de enlace; la tienda lo muestra en sus Ajustes.
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { MARCA } from "@/lib/marca";
import { Caja, e, MarcaDeAgua, Membrete, Partes, Pie, TablaItems } from "./comun";
import { contenidoPruebaConexion, type PruebaConexionPdf } from "./contenido";
import { COLOR } from "./estilo";

function DocumentoPrueba({ p }: { p: PruebaConexionPdf }) {
  const k = contenidoPruebaConexion(p);
  return (
    // Metadatos sin nada propio de la fábrica: solo el título (ADR-0024 §5).
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={p.creadaEn} modificationDate={p.creadaEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete tipo={k.tipo} numero={k.numero} meta={k.meta} />
        <View style={{ borderWidth: 1.2, borderColor: COLOR.acento, paddingVertical: 12, marginBottom: 16 }}>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 500, fontSize: 16, textAlign: "center", color: COLOR.acento }}>{k.rotulo}</Text>
        </View>
        <Partes partes={k.partes} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "En stock", "Por fabricar"]} filas={k.filas} />
        <Caja titulo="Cómo reconocerlo" texto={k.nota} />
        <Pie lineas={k.pie} />
        <MarcaDeAgua texto={k.marca} />
      </Page>
    </Document>
  );
}

export const pdfPruebaConexion = (p: PruebaConexionPdf): Promise<Buffer> => renderToBuffer(<DocumentoPrueba p={p} />);
