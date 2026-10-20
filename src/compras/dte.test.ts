import { describe, expect, it } from "vitest";
import { dteXml } from "../../tests/fixtures/chipax/dte";
import { decodificarXml, ErrorDte, leerDte, MAX_XML_BYTES } from "./dte";

const factura = {
  rut: "76543210-3", razon: "Maderas Ñuble SpA", tipo: 33, folio: 1201, fecha: "2026-10-14",
  lineas: [
    { codigo: "TAB-OR-01", nombre: "Tablón pino oregón 2x8", cantidad: 12.5, unidad: "M3", precio: 180000.5 },
    { nombre: "Flete a Panguipulli", cantidad: 1, unidad: "UN", precio: 35000 },
  ],
};

describe("compras.dte (ADR-0021)", () => {
  it("lee encabezado y líneas de un DTE suelto en ISO-8859-1, con tildes y eñes", () => {
    const [d] = leerDte(decodificarXml(dteXml(factura)));
    expect(d).toMatchObject({ tipo: 33, folio: 1201, fechaEmision: "2026-10-14", rutEmisor: "76543210-3", razonSocial: "Maderas Ñuble SpA" });
    expect(d.lineas).toEqual([
      { nro: 1, codigo: "TAB-OR-01", nombre: "Tablón pino oregón 2x8", cantidad: 12.5, unidad: "M3", precioUnitario: 180000.5 },
      { nro: 2, codigo: null, nombre: "Flete a Panguipulli", cantidad: 1, unidad: "UN", precioUnitario: 35000 },
    ]);
  });

  it("lee varios DTE dentro de un <EnvioDTE> con espacio de nombres", () => {
    const docs = leerDte(decodificarXml(dteXml(factura, { envio: true, extras: [{ ...factura, folio: 1202, lineas: [{ nombre: "Cola", cantidad: 4 }] }] })));
    expect(docs.map((d) => d.folio)).toEqual([1201, 1202]);
    expect(docs[1].lineas[0]).toMatchObject({ nombre: "Cola", cantidad: 4, unidad: null, codigo: null });
  });

  it("rechaza DOCTYPE (entidades externas), entidades desconocidas, XML roto y archivos enormes", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio></IdDoc><Emisor><RUTEmisor>1-9</RUTEmisor></Emisor></Encabezado><Detalle><NmbItem>&e;</NmbItem></Detalle></Documento></DTE>`;
    expect(() => leerDte(xxe)).toThrow(ErrorDte);
    expect(() => leerDte("<DTE><Documento><Detalle><NmbItem>&raro;</NmbItem></Detalle></Documento></DTE>")).toThrow(ErrorDte);
    expect(() => leerDte("<DTE><Documento>")).toThrow(ErrorDte);
    expect(() => leerDte("<Otro/>")).toThrow("no trae ningún DTE");
    expect(() => decodificarXml(new Uint8Array(MAX_XML_BYTES + 1))).toThrow(ErrorDte);
  });

  it("un DTE sin tipo, folio o RUT del emisor no se acepta", () => {
    expect(() => leerDte("<DTE><Documento><Encabezado><IdDoc><Folio>1</Folio></IdDoc></Encabezado></Documento></DTE>")).toThrow("tipo, folio o RUT");
  });
});
