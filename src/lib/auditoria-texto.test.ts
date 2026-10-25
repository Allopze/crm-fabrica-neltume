import { describe, expect, it } from "vitest";
import { detalle, resumenDetalle, textoAccion, textoRecurso } from "./auditoria-texto";

describe("lectura humana de la auditoría (REQ-ADM-3.2)", () => {
  it("traduce acciones y recursos, sin guiones bajos ni ids", () => {
    expect(textoAccion("consumo_produccion")).toBe("Consumo de producción");
    expect(textoAccion("crear manual")).toBe("Creación a mano");
    expect(textoAccion("POST /api/v1/ordenes/2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d/cerrar")).toBe("Cerrar orden de producción");
    expect(textoAccion("GET /api/v1/cotizaciones/2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d")).toBe("Consultar cotización");
    expect(textoAccion("GET /api/v1/metricas/ia?dias=30")).toBe("Consultar métricas");
    expect(textoAccion("algo_nuevo")).toBe("Algo nuevo");
    expect(textoAccion("convertir_a_puertas")).toBe("Convertir a puertas");
    expect(textoRecurso("nota_pedido")).toBe("Nota de pedido");
    expect(textoRecurso("otro_recurso")).toBe("Otro recurso");
  });

  it("muestra cifras y fechas en formato chileno y omite ids internos", () => {
    expect(detalle({ id: "x", cantidad: -0.2, total: 1060107, vigenciaHasta: "2026-10-22", activo: false })).toEqual([
      ["Cantidad", "-0,2"], ["Total", "$1.060.107"], ["Vigente hasta", "22-10-2026"], ["Activo", "no"],
    ]);
    expect(detalle({ motivo: "ver 2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d" })).toEqual([["Motivo", "ver …"]]);
    expect(detalle({ codigo: "INSUMOS_INSUFICIENTES" })).toEqual([["Código", "faltan insumos"]]);
    expect(detalle({ codigo: "NEL-R-4-B" })).toEqual([["Código", "NEL-R-4-B"]]);
  });

  it("recupera las tildes de los campos que no tienen traducción", () => {
    expect(detalle({ articulos: 76, yaExistian: 0, codigosNuevos: 1, fueraCatalogo: 213, historico: 2 }).map(([k]) => k))
      .toEqual(["Artículos", "Ya existían", "Códigos nuevos", "Fuera de catálogo", "Histórico"]);
  });

  it("lee las pruebas de conexión con la tienda: acciones, recurso, accesos denegados y detalle sin ids ni huellas (ADR-0024)", () => {
    expect(textoRecurso("prueba_conexion")).toBe("Prueba de conexión con la tienda");
    expect(textoAccion("solicitar prueba de conexion")).toBe("Prueba de conexión pedida");
    expect(textoAccion("enviar prueba de conexion")).toBe("Prueba de conexión enviada a la tienda");
    expect(textoAccion("recibir prueba de conexion")).toBe("Prueba de conexión recibida de la tienda");
    expect(textoAccion("POST /api/v1/integracion/tienda/pruebas")).toBe("Enviar prueba de conexión a la tienda");
    expect(textoAccion("GET /api/v1/integracion/tienda/pruebas")).toBe("Consultar conexión con la tienda");
    expect(textoAccion("GET /api/v1/integracion/tienda/pruebas/2acb16c4-c75c-40ed-90fe-9d2afd0c4f9d/pdf")).toBe("Ver PDF de una prueba de conexión");
    expect(detalle({ eventId: "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa", codigo: "6f1c2a7e", sha256: "a".repeat(64), estado: "aceptada", httpStatus: 201, latenciaMs: 1234, destino: "cotizador.puertasneltume.cl", bytes: 20480 }))
      .toEqual([["Código", "6f1c2a7e"], ["Estado", "aceptada"], ["Respuesta HTTP", "201"], ["Latencia (ms)", "1.234"], ["Destino", "cotizador.puertasneltume.cl"], ["Tamaño (bytes)", "20.480"]]);
  });

  it("resume en una línea con hasta tres campos", () => {
    expect(resumenDetalle({ estado: "aprobada", total: 5000, iva: 950, subtotal: 4050 })).toBe("Estado: aprobada · Total: $5.000 · IVA: $950 · …");
    expect(resumenDetalle(null)).toBe("");
  });
});
