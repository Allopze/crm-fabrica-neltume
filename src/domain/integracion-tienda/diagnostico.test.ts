import { describe, expect, it } from "vitest";
import { clasificarFalloDeRed, diagnosticarFalloDeRed, diagnosticarRespuesta, ENVIO_INTERRUMPIDO, FIRMA_VENCIDA, sinUrl } from "./diagnostico";

const EVENTO = "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa";
const T0 = 1_793_102_400_000;
const confirmacion = (extra: object = {}) => JSON.stringify({ status: "accepted", eventId: EVENTO, receiver: "neltume-store", receivedAt: new Date(T0 + 150).toISOString(), ...extra });
const error = (code: string, message?: string) => JSON.stringify({ error: { code, ...(message ? { message } : {}) } });
const responde = (status: number, texto: string, ms = 300) => diagnosticarRespuesta({ status, texto, eventId: EVENTO, inicioMs: T0, finMs: T0 + ms });

describe("integracion.diagnostico: la respuesta de la tienda (contrato prueba-conexion-v1 §6)", () => {
  it("2xx con su identidad y el mismo evento: aceptada, con la latencia", () => {
    expect(responde(201, confirmacion())).toMatchObject({ estado: "aceptada", httpStatus: 201, codigoError: null, detalle: "Aceptada en 300 ms.", latenciaMs: 300 });
    expect(responde(200, confirmacion({ status: "duplicate" }))).toMatchObject({ estado: "duplicada", detalle: "Aceptada en 300 ms (la tienda ya la tenía)." });
  });

  it("2xx que no es la confirmación de la tienda: «Respondió otra aplicación»", () => {
    for (const texto of [confirmacion({ receiver: "neltume-factory" }), confirmacion({ eventId: "00000000-0000-4000-8000-000000000000" }),
      "<html>no soy la tienda</html>", "", JSON.stringify({ status: "accepted" }), confirmacion({ status: "otra-cosa" })]) {
      expect(responde(201, texto), texto.slice(0, 40)).toMatchObject({ estado: "rechazada", codigoError: "otra_aplicacion", detalle: "Respondió otra aplicación" });
    }
  });

  it("avisa del reloj sin fallar cuando difiere más de 60 s, tomando el punto medio del viaje", () => {
    const adelantado = responde(201, confirmacion({ receivedAt: new Date(T0 + 150 + 5 * 60_000).toISOString() }));
    expect(adelantado).toMatchObject({ estado: "aceptada", desfaseRelojMs: 300_000 });
    expect(adelantado.detalle).toMatch(/Aviso: el reloj de la tienda difiere 300 s del nuestro y la firma solo vale ±300 s/);
    expect(responde(201, confirmacion({ receivedAt: new Date(T0 + 150 - 120_000).toISOString() })).detalle).toMatch(/difiere 120 s/);
    // Hasta 60 s no avisa, y sin receivedAt tampoco hay desfase.
    expect(responde(201, confirmacion({ receivedAt: new Date(T0 + 150 + 60_000).toISOString() })).detalle).toBe("Aceptada en 300 ms.");
    expect(responde(201, confirmacion({ receivedAt: undefined }))).toMatchObject({ desfaseRelojMs: null, detalle: "Aceptada en 300 ms." });
  });

  it.each([
    [401, error("invalid_signature"), "invalid_signature", /La tienda rechazó la firma: el secreto no coincide o los relojes difieren en más de 5 minutos/],
    [403, "<h1>Forbidden</h1>", "forbidden", /La tienda rechazó el acceso \(403\): revisa el Host permitido o el acceso por Cloudflare/],
    [404, "<h1>No encontrado</h1>", "not_found", /La tienda aún no tiene esta ruta \(versión sin desplegar\)/],
    [405, "", "method_not_allowed", /La tienda aún no tiene esta ruta \(versión sin desplegar\)/],
    [503, error("not_configured"), "not_configured", /La tienda no tiene configurada la integración/],
    [503, "", "http_503", /La tienda respondió 503/],
    [429, error("rate_limited"), "rate_limited", /La tienda respondió 429/],
    [500, "boom", "http_500", /La tienda respondió 500/],
    [502, "", "http_502", /La tienda respondió 502/],
  ])("%i → «%s»", (status, texto, codigo, detalle) => {
    expect(responde(status, texto)).toMatchObject({ estado: "rechazada", httpStatus: status, codigoError: codigo, desfaseRelojMs: null });
    expect(responde(status, texto).detalle).toMatch(detalle);
  });

  it.each([400, 409, 413, 415, 422])("%i → el error.code tal cual, con su mensaje", (status) => {
    const r = responde(status, error("schema_invalid", "campo extra"));
    expect(r).toMatchObject({ estado: "rechazada", codigoError: "schema_invalid" });
    expect(r.detalle).toBe(`La tienda rechazó la prueba (${status}): schema_invalid — campo extra`);
    expect(responde(status, "").detalle).toBe(`La tienda rechazó la prueba (${status}): sin código`);
    expect(responde(status, "").codigoError).toBe(`http_${status}`);
  });

  it("sanea lo que diga la tienda para que se pueda guardar: sin caracteres de control, sin códigos raros y con el desfase acotado", () => {
    // Un NUL en `text` rompe el UPDATE en Postgres; un código que no es un identificador se descarta.
    const raro = responde(422, JSON.stringify({ error: { code: "a\u0000b", message: "x\u0000y\u0001z\n\tw" } }));
    expect(raro.codigoError).toBe("http_422");
    expect(raro.detalle).toBe("La tienda rechazó la prueba (422): sin código — x y z w");
    expect(raro.detalle).not.toMatch(/[\u0000-\u001f]/);
    expect(responde(400, JSON.stringify({ error: { code: "schema invalid con espacios", message: "\u0000" } }))).toMatchObject({ codigoError: "http_400", detalle: "La tienda rechazó la prueba (400): sin código" });
    // Un receivedAt absurdo no cabe en el integer de la BD: se acota a ±2.000.000.000 ms y el aviso sigue ahí.
    for (const [receivedAt, signo] of [["2099-01-01T00:00:00.000Z", 1], ["1970-01-01T00:00:00.000Z", -1]] as const) {
      const r = responde(201, confirmacion({ receivedAt }));
      expect(r).toMatchObject({ estado: "aceptada", desfaseRelojMs: signo * 2_000_000_000 });
      expect(r.detalle).toMatch(/Aviso: el reloj de la tienda difiere 2\.000\.000 s/);
    }
  });

  it("recorta lo que diga la tienda: el detalle nunca pasa de 300 caracteres", () => {
    const r = responde(422, error("document_invalid", "x".repeat(500)));
    expect(r.detalle.length).toBeLessThanOrEqual(300);
    expect(responde(422, error("document_invalid", "x".repeat(600))).detalle.length).toBeLessThanOrEqual(300);
  });
});

describe("integracion.diagnostico: cuando no hay respuesta", () => {
  const falla = (e: unknown) => diagnosticarFalloDeRed(clasificarFalloDeRed(e, 15_000));
  const conCausa = (cause: object) => Object.assign(new TypeError("fetch failed"), { cause });

  it("clasifica los errores de fetch de Node: plazo, redirección, DNS, conexión rechazada, TLS y otros", () => {
    expect(falla(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toMatchObject({ estado: "sin_respuesta", codigoError: "timeout", detalle: "No se pudo conectar con la tienda: sin respuesta en 15.000 ms" });
    expect(falla(conCausa(new Error("unexpected redirect")))).toMatchObject({ codigoError: "redirect", detalle: "No se pudo conectar: redirección inesperada (¿Cloudflare Access?)" });
    expect(falla(conCausa(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" })))).toMatchObject({ codigoError: "dns", detalle: "No se pudo conectar con la tienda: no se encontró el servidor (DNS)" });
    expect(falla(conCausa(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })))).toMatchObject({ codigoError: "connection_refused", detalle: "No se pudo conectar con la tienda: conexión rechazada" });
    for (const code of ["ERR_SSL_WRONG_VERSION_NUMBER", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
      expect(falla(conCausa(Object.assign(new Error("tls"), { code }))), code).toMatchObject({ codigoError: "tls", detalle: "No se pudo conectar con la tienda: certificado o conexión segura inválidos" });
    }
    expect(falla(conCausa(new Error("algo raro")))).toMatchObject({ codigoError: "network", detalle: "No se pudo conectar con la tienda: algo raro" });
    // Un AggregateError (varias direcciones) viene sin mensaje y con el código dentro: el motivo no puede quedar vacío.
    const agregado = (code: string) => conCausa(Object.assign(new AggregateError([Object.assign(new Error(""), { code })], ""), { code: undefined }));
    expect(falla(agregado("ECONNREFUSED"))).toMatchObject({ codigoError: "connection_refused" });
    expect(falla(agregado("ENOTFOUND"))).toMatchObject({ codigoError: "dns" });
    for (const [code, motivo] of [["ENETUNREACH", "no hay ruta hacia el servidor"], ["EHOSTUNREACH", "no hay ruta hacia el servidor"], ["ETIMEDOUT", "se agotó el plazo de conexión"],
      ["UND_ERR_CONNECT_TIMEOUT", "se agotó el plazo de conexión"], ["UND_ERR_HEADERS_TIMEOUT", "la tienda tardó demasiado en contestar"], ["ECONNRESET", "la conexión se cortó"]]) {
      expect(falla(agregado(code)), code).toMatchObject({ estado: "sin_respuesta", codigoError: "network", detalle: `No se pudo conectar con la tienda: ${motivo}` });
      expect(falla(conCausa(Object.assign(new Error(""), { code }))).detalle, `${code} sin mensaje`).toBe(`No se pudo conectar con la tienda: ${motivo}`);
    }
    // Sin mensaje ni código conocido, al menos el nombre del error.
    expect(falla(Object.assign(new TypeError(""), { cause: undefined })).detalle).toBe("No se pudo conectar con la tienda: TypeError");
    expect(falla("texto suelto")).toMatchObject({ codigoError: "network", detalle: "No se pudo conectar con la tienda: texto suelto" });
  });

  it("sin la URL de la tienda o con una firma vencida, ni se intenta; un envío interrumpido no se sabe cómo terminó", () => {
    expect(sinUrl("Falta configurar ENLACE_TIENDA_URL en el servicio de enlace.")).toMatchObject({ estado: "no_configurada", codigoError: "no_configurada", detalle: "Falta configurar ENLACE_TIENDA_URL en el servicio de enlace." });
    expect(FIRMA_VENCIDA).toMatchObject({ estado: "vencida", codigoError: "vencida" });
    expect(FIRMA_VENCIDA.detalle).toMatch(/más de 4 minutos/);
    expect(ENVIO_INTERRUMPIDO).toMatchObject({ estado: "sin_respuesta", codigoError: "interrumpida" });
    expect(ENVIO_INTERRUMPIDO.detalle).toMatch(/no se sabe si la tienda la recibió/);
  });
});
