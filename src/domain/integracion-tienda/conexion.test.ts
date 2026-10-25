import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pdf, SECRETO_PRUEBA } from "../../../tests/fixtures/tienda/mensaje";
import { mensajePruebaTienda } from "../../../tests/fixtures/tienda/prueba-conexion";
import {
  armarPruebaSaliente, bytesDeBase64, clavePrueba, codigoCorto, MAX_PDF_PRUEBA, mensajePruebaEnviada, mensajePruebaRecibida, verificarPdfPrueba,
} from "./conexion";
import { DocumentoInvalido } from "./documentos";
import { verificarFirma } from "./firma";

const EVENTO = "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa";

describe("integracion.conexion: el mensaje (contrato prueba-conexion-v1 §2)", () => {
  it("acepta lo que manda la tienda y rechaza campos de más, el source propio y formatos fuera del contrato", async () => {
    const m = await mensajePruebaTienda({ eventId: EVENTO });
    expect(mensajePruebaRecibida.safeParse(m).success).toBe(true);
    const no = (cambio: object) => expect(mensajePruebaRecibida.safeParse({ ...m, ...cambio }).success, JSON.stringify(cambio).slice(0, 80)).toBe(false);
    no({ extra: 1 });
    no({ source: "neltume-factory" }); // cada receptor exige el source de la otra parte
    no({ eventType: "order.ready" });
    no({ schemaVersion: "2.0" });
    no({ eventId: EVENTO.toUpperCase() }); // UUID en minúsculas
    no({ eventId: "no-es-un-uuid" });
    no({ issuedAt: "2026-10-25T15:02:11-03:00" }); // ISO con Z, no con desfase
    no({ factoryCode: "x".repeat(41) });
    no({ document: { ...m.document, extra: true } });
    no({ document: { ...m.document, mimeType: "text/plain" } });
    no({ document: { ...m.document, sha256: m.document.sha256.toUpperCase() } });
    no({ document: { ...m.document, contentBase64: "" } });
    // `factoryCode` no es un enum: cualquier texto de hasta 40 caracteres pasa el esquema (después se compara con la fábrica).
    expect(mensajePruebaRecibida.safeParse({ ...m, factoryCode: "SANTIAGO" }).success).toBe(true);
    expect(mensajePruebaRecibida.safeParse({ ...m, factoryCode: "x".repeat(40) }).success).toBe(true);
  });

  it("el nombre del archivo es ASCII sin espacios ni rutas, de hasta 100 caracteres y termina en .pdf", async () => {
    const m = await mensajePruebaTienda({ eventId: EVENTO });
    const con = (filename: string) => mensajePruebaRecibida.safeParse({ ...m, document: { ...m.document, filename } }).success;
    expect(con("prueba-conexion-6f1c2a7e.pdf")).toBe(true);
    expect(con(`${"a".repeat(100)}.pdf`)).toBe(true);
    for (const malo of ["con espacio.pdf", "tilde-ñ.pdf", "../x.pdf", "a/b.pdf", "sin-extension", "x.PDF", `${"a".repeat(101)}.pdf`, ".pdf"]) expect(con(malo), malo).toBe(false);
  });

  it("la fábrica emite source neltume-factory: el esquema de lo que manda lo exige y el de lo que recibe lo rechaza", async () => {
    const m = await mensajePruebaTienda({ eventId: EVENTO });
    expect(mensajePruebaEnviada.safeParse({ ...m, source: "neltume-factory" }).success).toBe(true);
    expect(mensajePruebaEnviada.safeParse(m).success).toBe(false);
  });

  it("la clave de idempotencia lleva el origen y el evento; el código corto son sus 8 primeros caracteres", () => {
    expect(clavePrueba("neltume-store", EVENTO)).toBe(`neltume-store:connection-test:${EVENTO}`);
    expect(clavePrueba("neltume-factory", EVENTO)).toBe(`neltume-factory:connection-test:${EVENTO}`);
    expect(codigoCorto(EVENTO)).toBe("6f1c2a7e");
  });

  it("calcula el tamaño que declara un base64 sin decodificarlo", () => {
    expect(bytesDeBase64("")).toBe(0);
    for (const n of [1, 2, 3, 4, 5, 1000, 1_048_576]) expect(bytesDeBase64(Buffer.alloc(n, 7).toString("base64")), `${n} bytes`).toBe(n);
  });
});

describe("integracion.conexion: el mensaje que manda la fábrica (ADR-0024 §3)", () => {
  it("lo arma y lo firma la app con el secreto vigente, y la tienda puede verificarlo sobre los bytes crudos", async () => {
    const contenido = await pdf(["Prueba"]);
    const ahora = new Date("2026-10-25T15:02:11.384Z");
    const p = armarPruebaSaliente({ secreto: SECRETO_PRUEBA, fabrica: "PANGUIPULLI", pdf: contenido, eventId: EVENTO, ahora });
    expect(p.nombreArchivo).toBe("prueba-conexion-6f1c2a7e.pdf");
    expect(p.cabeceras["x-idempotency-key"]).toBe(`neltume-factory:connection-test:${EVENTO}`);
    expect(p.hashCuerpo).toBe(createHash("sha256").update(p.cuerpo).digest("hex"));
    expect(p.firmadaEn).toEqual(ahora);
    const cab = { timestamp: p.cabeceras["x-neltume-timestamp"], firma: p.cabeceras["x-neltume-signature"] };
    expect(verificarFirma([SECRETO_PRUEBA], cab, p.cuerpo, ahora.getTime())).toEqual({ ok: true });
    // Un byte distinto o otro secreto, no.
    expect(verificarFirma([SECRETO_PRUEBA], cab, new Uint8Array([...p.cuerpo.slice(0, -1), 32]), ahora.getTime())).toMatchObject({ ok: false });
    expect(verificarFirma(["otro-secreto-de-al-menos-32-caracteres-x"], cab, p.cuerpo, ahora.getTime())).toMatchObject({ ok: false });

    const m = JSON.parse(new TextDecoder().decode(p.cuerpo));
    expect(m).toMatchObject({ schemaVersion: "1.0", eventType: "connection.test", eventId: EVENTO, source: "neltume-factory", factoryCode: "PANGUIPULLI", issuedAt: "2026-10-25T15:02:11.384Z" });
    expect(mensajePruebaEnviada.safeParse(m).success).toBe(true);
    // Reflejado de vuelta a la fábrica no sirve: exige el source de la tienda.
    expect(mensajePruebaRecibida.safeParse(m).success).toBe(false);
    expect(Buffer.from(m.document.contentBase64, "base64").equals(contenido)).toBe(true);
    expect(m.document.sha256).toBe(createHash("sha256").update(contenido).digest("hex"));
  });

  it("no incluye el secreto ni lo deja en ninguna parte del cuerpo ni de las cabeceras", async () => {
    const p = armarPruebaSaliente({ secreto: SECRETO_PRUEBA, fabrica: "PANGUIPULLI", pdf: await pdf(["x"]) });
    expect(Buffer.from(p.cuerpo).toString("utf8")).not.toContain(SECRETO_PRUEBA);
    expect(JSON.stringify(p.cabeceras)).not.toContain(SECRETO_PRUEBA);
  });

  it("no firma un PDF de más de 1 MiB", () => {
    expect(() => armarPruebaSaliente({ secreto: SECRETO_PRUEBA, fabrica: "PANGUIPULLI", pdf: Buffer.alloc(MAX_PDF_PRUEBA + 1) })).toThrow(/1 MiB/);
  });
});

describe("integracion.conexion: el PDF que llega (contrato §3, pasos 7 y 8)", () => {
  const documento = (contenido: Buffer) => ({
    filename: "prueba-conexion-abcdef12.pdf", mimeType: "application/pdf" as const,
    contentBase64: contenido.toString("base64"), sha256: createHash("sha256").update(contenido).digest("hex"),
  });

  it("acepta un PDF íntegro y devuelve sus bytes", async () => {
    const contenido = await pdf(["Prueba de conexión"]);
    expect((await verificarPdfPrueba(documento(contenido))).equals(contenido)).toBe(true);
  });

  it("más de 1 MiB es 413 payload_too_large, y se rechaza antes de decodificar", async () => {
    const demasiado = "A".repeat(Math.ceil((MAX_PDF_PRUEBA + 3) / 3) * 4);
    const d = { ...documento(await pdf(["x"])), contentBase64: demasiado };
    await expect(verificarPdfPrueba(d)).rejects.toMatchObject({ http: 413, codigo: "payload_too_large" });
  });

  it("un base64 que no es el canónico (saltos de línea, sin relleno) es 422, aunque decodifique", async () => {
    const buen = documento(await pdf(["Prueba de conexión"]));
    const conSalto = `${buen.contentBase64.slice(0, 60)}\n${buen.contentBase64.slice(60)}`;
    await expect(verificarPdfPrueba({ ...buen, contentBase64: conSalto })).rejects.toThrow(/canónico/);
    // 35 bytes: su base64 lleva un «=» de relleno; sin él decodifica igual, pero ya no es el canónico.
    const conRelleno = documento(Buffer.from("%PDF-1.4 con relleno en el base64.."));
    expect(conRelleno.contentBase64.endsWith("=")).toBe(true);
    await expect(verificarPdfPrueba({ ...conRelleno, contentBase64: conRelleno.contentBase64.replace(/=+$/, "") })).rejects.toThrow(/canónico/);
  });

  it("rechaza con 422 un sha256 que no coincide, lo que no es un PDF y un PDF dañado", async () => {
    const buen = documento(await pdf(["Prueba de conexión"]));
    await expect(verificarPdfPrueba({ ...buen, sha256: "0".repeat(64) })).rejects.toThrow(/sha256/);
    await expect(verificarPdfPrueba(documento(Buffer.from("hola, esto no es un PDF")))).rejects.toThrow(/no es un PDF/);
    await expect(verificarPdfPrueba(documento(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("basura sin estructura alguna")])))).rejects.toBeInstanceOf(DocumentoInvalido);
    await expect(verificarPdfPrueba(documento(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("basura sin estructura alguna")])))).rejects.toThrow(/dañado/);
  });
});
