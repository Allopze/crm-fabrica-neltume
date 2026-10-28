import { describe, expect, it } from "vitest";
import { fragmentosPdf } from "../pedidos/pdf-texto";
import { renderizarOrdenTrabajo } from "./orden-trabajo";

// En un archivo propio: necesita el caché de fuentes vacío, como al arrancar el servidor. react-pdf reutiliza el objeto de
// fontkit entre documentos y un primer PDF sin comas en Instrument Sans 400 dejaba la coma sin carácter: en los siguientes
// se copiaba del PDF como «$», «)» o nada (encontrado en la Fase 28; ver `prepararFuentes` en estilo.ts).
const orden = (titulo: string, observacion: string | null) => ({
  numero: 3, creadoEn: new Date("2026-10-26T15:00:00Z"), estado: "pendiente", cotizacionNumero: null, notaTienda: "703", revisionTienda: 1, proyecto: "Casa Lago",
  direccionDespacho: "Camino a Neltume km 3", medioTransporte: "Starken", entregaComprometida: null, observaciones: null,
  items: [{ codigo: "FUY-O-2-A", descripcion: titulo, medidaSolicitada: null, observacion, revisar: null, referencias: [], cantidad: 1, reservado: 0, faltante: 1 }],
});
const texto = async (pdf: Buffer) => (await fragmentosPdf(new Uint8Array(pdf))).map((f) => f.texto).join(" ");

describe("las fuentes de los PDF entre un documento y el siguiente", () => {
  it("la coma (y lo demás) se copia bien del PDF aunque el anterior no la usara en la misma fuente", async () => {
    await renderizarOrdenTrabajo(orden("Fuy · Pino Oregón · 0,70 × 2,00 m", null));
    const t = await texto(await renderizarOrdenTrabajo(orden("Fuy", "tres, cuatro; ¿cinco? 50 % (seis) $7")));
    expect(t).toContain("Observación: tres, cuatro; ¿cinco? 50 % (seis) $7");
  });
});
