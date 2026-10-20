// DTE sintéticos para las pruebas de compras desde Chipax (ADR-0021): RUT, folios y montos ficticios; nunca facturas
// reales de datos/. Reproducen la estructura del SII: <DTE><Documento><Encabezado>…<Detalle>…, suelto o en <EnvioDTE>.

export interface LineaPrueba { codigo?: string; nombre: string; cantidad?: number; unidad?: string; precio?: number }
export interface FacturaPrueba { rut: string; razon: string; tipo: number; folio: number; fecha: string; lineas: LineaPrueba[] }

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function documento(f: FacturaPrueba): string {
  const detalle = f.lineas.map((l, i) => `
      <Detalle>
        <NroLinDet>${i + 1}</NroLinDet>${l.codigo ? `
        <CdgItem><TpoCodigo>INT1</TpoCodigo><VlrCodigo>${esc(l.codigo)}</VlrCodigo></CdgItem>` : ""}
        <NmbItem>${esc(l.nombre)}</NmbItem>${l.cantidad !== undefined ? `
        <QtyItem>${l.cantidad}</QtyItem>` : ""}${l.unidad ? `
        <UnmdItem>${esc(l.unidad)}</UnmdItem>` : ""}${l.precio !== undefined ? `
        <PrcItem>${l.precio}</PrcItem>` : ""}
        <MontoItem>${Math.round((l.cantidad ?? 1) * (l.precio ?? 0))}</MontoItem>
      </Detalle>`).join("");
  return `<DTE version="1.0">
    <Documento ID="F${f.folio}T${f.tipo}">
      <Encabezado>
        <IdDoc><TipoDTE>${f.tipo}</TipoDTE><Folio>${f.folio}</Folio><FchEmis>${f.fecha}</FchEmis></IdDoc>
        <Emisor><RUTEmisor>${f.rut}</RUTEmisor><RznSoc>${esc(f.razon)}</RznSoc></Emisor>
        <Receptor><RUTRecep>76111111-6</RUTRecep><RznSocRecep>Fábrica de prueba</RznSocRecep></Receptor>
        <Totales><MntTotal>1</MntTotal></Totales>
      </Encabezado>${detalle}
      <TED version="1.0"><DD><RE>${f.rut}</RE><TD>${f.tipo}</TD><F>${f.folio}</F></DD></TED>
    </Documento>
  </DTE>`;
}

/** XML de la factura en ISO-8859-1 (como los del SII), suelto o dentro de un <EnvioDTE>. */
export function dteXml(f: FacturaPrueba, o: { envio?: boolean; extras?: FacturaPrueba[] } = {}): Uint8Array {
  const cuerpo = o.envio
    ? `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="SetDoc"><Caratula><RutEmisor>${f.rut}</RutEmisor></Caratula>${[f, ...(o.extras ?? [])].map(documento).join("")}</SetDTE></EnvioDTE>`
    : documento(f);
  return Uint8Array.from(Buffer.from(`<?xml version="1.0" encoding="ISO-8859-1"?>\n${cuerpo}`, "latin1"));
}
