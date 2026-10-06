// Genera notas de pedido de la tienda SINTÉTICAS (mismo formato que el cotizador de la tienda, códigos del Excel mini)
// para las pruebas del pedido directo (ADR-0008). Uso: node scripts/generar-nota-tienda.mjs
import { writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

const e = StyleSheet.create({
  pagina: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  fila: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderColor: "#ccc" },
  par: { flexDirection: "row", gap: 4, marginBottom: 6 },
});
const col = (w, extra = {}) => ({ width: w, ...extra });
const C = { item: col(30), cod: col(70), desc: col(220), cant: col(40, { textAlign: "right" }), unit: col(70, { textAlign: "right" }), tot: col(60, { textAlign: "right" }), listo: col(30, { textAlign: "right" }) };
const $ = (n) => `$${n.toLocaleString("es-CL")}`;

function nota({ numero, lineas }) {
  const subtotal = lineas.reduce((t, l) => t + l.cant * l.unit, 0);
  const iva = Math.round(subtotal * 0.19);
  return h(Document, null, h(Page, { size: "A4", style: e.pagina },
    h(Text, { style: { fontSize: 16, textAlign: "right" } }, `NOTA DE PEDIDO N° ${numero}`),
    h(View, { style: { alignItems: "flex-end", marginTop: 6 } },
      h(View, { style: e.par }, h(Text, null, "Fecha:"), h(Text, null, "06-10-2026")),
      h(View, { style: e.par }, h(Text, null, "Ref. cotización:"), h(Text, null, "N° 340"))),
    h(View, { style: { flexDirection: "row", marginTop: 20 } },
      h(View, { style: { width: 250 } }, h(Text, null, "CLIENTE"), h(View, { style: e.par }, h(Text, null, "Nombre:"), h(Text, null, "Cliente Final de Prueba")), h(View, { style: e.par }, h(Text, null, "RUT:"), h(Text, null, "12.345.678-5"))),
      h(View, null, h(Text, null, "DESPACHO"),
        h(View, { style: e.par }, h(Text, null, "Dirección de despacho:"), h(Text, null, "Camino a Neltume km 3, Panguipulli")),
        h(View, { style: e.par }, h(Text, null, "Medio de transporte:"), h(Text, null, "Camión de fábrica")),
        h(View, { style: e.par }, h(Text, null, "Proyecto:"), h(Text, null, "Casa Lago")))),
    h(View, { style: [e.fila, { marginTop: 20 }] }, ...["ITEM", "CÓDIGO", "DESCRIPCIÓN", "CANT.", "PRECIO UNIT.", "TOTAL", "LISTO"].map((t, i) => h(Text, { key: t, style: Object.values(C)[i] }, t))),
    ...lineas.map((l, i) => h(View, { key: l.cod, style: e.fila },
      h(Text, { style: C.item }, String(i + 1)), h(Text, { style: C.cod }, l.cod),
      h(View, { style: C.desc }, h(Text, null, l.desc), ...(l.medida ? [h(Text, { style: { fontSize: 7, marginTop: 2 } }, `Medida solicitada: ${l.medida}`)] : [])),
      h(Text, { style: C.cant }, String(l.cant)), h(Text, { style: C.unit }, $(l.unit)), h(Text, { style: C.tot }, $(l.cant * l.unit)), h(Text, { style: C.listo }, ""))),
    h(View, { style: { marginTop: 14, marginLeft: 300 } },
      h(View, { style: e.par }, h(Text, { style: { width: 100 } }, "SUBTOTAL"), h(Text, null, $(subtotal))),
      h(View, { style: e.par }, h(Text, { style: { width: 100 } }, "I.V.A. 19 %"), h(Text, null, $(iva))),
      h(View, { style: e.par }, h(Text, { style: { width: 100 } }, "TOTAL"), h(Text, null, $(subtotal + iva)))),
    h(View, { style: [e.par, { marginTop: 20 }] }, h(Text, null, "Entrega comprometida:"), h(Text, null, "20-11-2026")),
  ));
}

const casos = {
  // FUY-O-2-A a precio de lista (144.000 en el mini); el marco con un precio distinto al de lista (19.500) para el aviso.
  "nota-tienda-mini.pdf": { numero: 41, lineas: [
    { cod: "FUY-O-2-A", desc: "Fuy Pino Oregon 0,70 a 0,75 m × 2 m", medida: "720 × 2000 mm (Vano)", cant: 3, unit: 144000 },
    { cod: "MAR-O-2X4-B", desc: "Marco Pino Oregon 2x4 pulg. kit", medida: null, cant: 3, unit: 19000 },
  ] },
  "nota-tienda-codigo-malo.pdf": { numero: 42, lineas: [{ cod: "ZZZ-O-9-Z", desc: "Modelo inexistente", medida: null, cant: 1, unit: 1000 }] },
};
for (const [archivo, datos] of Object.entries(casos)) {
  writeFileSync(`e2e/fixtures/${archivo}`, await renderToBuffer(nota(datos)));
  console.log(`✓ e2e/fixtures/${archivo}`);
}
