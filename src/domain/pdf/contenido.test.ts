import { describe, expect, it } from "vitest";
import { datosEmpresa } from "@/lib/marca";
import { contenidoCotizacion, contenidoPedido, fechaSantiago, lineasEmpresa } from "./contenido";

const base = {
  numero: 124, aprobadaEn: new Date("2026-10-06T02:30:00Z"), vigenciaHasta: "2026-10-20", listaVersion: 3,
  cliente: { nombre: "Constructora Los Alerces", rut: "12.345.678-5", comuna: "Temuco", contacto: null },
  items: [
    { codigo: "NEL-R-4-B", descripcion: "Neltume · Raulí · 0,90 a 0,95 × 2,10 m", cantidad: 3, precioUnitario: 277760, totalLinea: 833280 },
    { codigo: null, descripcion: "Toltén · Raulí · 0,87 × 2,15 m", cantidad: 2, precioUnitario: 400000, totalLinea: 800000 },
  ],
  subtotal: 1633280, descuento: 0, descuentoMotivo: null, iva: 310323, total: 1943603, abonoPct: 50,
};

describe("pdf.contenido (REQ-COT-4.2)", () => {
  it("formato chileno, vigencia, cliente y la nota de flete", () => {
    const k = contenidoCotizacion(base);
    expect(k.titulo).toBe("Cotización N.º 124");
    expect(k.fechas).toBe("Fecha 05-10-2026 · Válida hasta 20-10-2026"); // 23:30 del 05-10 en Santiago
    expect(k.cliente).toContainEqual(["RUT", "12.345.678-5"]);
    expect(k.cliente).toContainEqual(["Contacto", "—"]);
    expect(k.lineas[0]).toEqual({ codigo: "NEL-R-4-B", descripcion: base.items[0].descripcion, cantidad: "3", unitario: "$277.760", total: "$833.280" });
    expect(k.lineas[1].codigo).toBe("A pedido");
    expect(k.totales).toEqual([["Subtotal neto", "$1.633.280"], ["IVA 19 %", "$310.323"]]);
    expect(k.total).toBe("$1.943.603");
    expect(k.pie[0]).toContain("Valores puestos en fábrica, flete aparte.");
    expect(k.pie[0]).toContain("lista v3");
    expect(k.pie[2]).toBe("Condición de pago: 50 % de abono al confirmar y saldo antes del despacho o retiro.");
    expect(contenidoCotizacion({ ...base, abonoPct: 100 }).pie[2]).toBe("Condición de pago: total antes del despacho o retiro.");
  });

  it("muestra el descuento con su motivo solo si existe", () => {
    const k = contenidoCotizacion({ ...base, descuento: 50000, descuentoMotivo: "cliente frecuente" });
    expect(k.totales[1]).toEqual(["Descuento (cliente frecuente)", "−$50.000"]);
  });

  it("la fecha se toma en la zona de Santiago", () => {
    expect(fechaSantiago(new Date("2026-01-01T02:00:00Z"))).toBe("31-12-2025");
  });
});

describe("pdf.contenido de la nota de pedido (REQ-COT-8.1, 8.16)", () => {
  it("muestra despacho, faltante por fabricar y totales congelados", () => {
    const k = contenidoPedido({
      numero: 7, creadoEn: new Date("2026-10-06T15:00:00Z"), estado: "pendiente", cotizacionNumero: 124, notaTienda: null,
      cliente: { nombre: "Ferretería Puyehue", rut: "11.111.111-1", contacto: null, telefono: null },
      direccionDespacho: null, medioTransporte: "Camión propio", entregaComprometida: "2026-11-20", observaciones: "Llamar antes",
      items: [{ codigo: "FUY-O-2-A", descripcion: "Fuy", medidaSolicitada: null, cantidad: 3, faltante: 1, totalLinea: 300000 }, { codigo: null, descripcion: "Toltén", medidaSolicitada: "870 × 2150 mm (vano)", cantidad: 1, faltante: 1, totalLinea: 1000 }],
      subtotal: 301000, descuento: 0, iva: 57190, total: 358190, pago: { pagado: 179095, saldo: 179095 },
    });
    expect(k.titulo).toBe("Nota de pedido N.º 7");
    expect(k.fechas).toBe("Fecha 06-10-2026 · Cotización N.º 124");
    expect(k.datos).toContainEqual(["Despacho", "Retira en fábrica"]);
    expect(k.filas).toEqual([["FUY-O-2-A", "Fuy", "3", "1", "$300.000"], ["A pedido", "Toltén\nMedida solicitada: 870 × 2150 mm (vano)", "1", "1", "$1.000"]]);
    expect(k.datos).toContainEqual(["Entrega", "20-11-2026"]);
    expect(k.observaciones).toBe("Llamar antes");
    expect(k.total).toBe("$358.190");
    expect(k.pago).toEqual([["Pagado", "$179.095"], ["Saldo", "$179.095"]]);
    expect(k.pie[0]).toContain("flete aparte");
  });
});

describe("datos de la empresa en el membrete (marca real)", () => {
  it("imprime solo los datos configurados, con nombre y correo por defecto", () => {
    expect(lineasEmpresa(datosEmpresa({}))).toEqual(["Neltume.co"]);
    expect(datosEmpresa({}).correo).toBe("Neltume.co@gmail.com");
    const d = datosEmpresa({ NELTUME_EMPRESA_RUT: "11.111.111-1", NELTUME_EMPRESA_DIRECCION: "Camino a Neltume s/n", NELTUME_EMPRESA_WEB: "ejemplo.cl", NELTUME_EMPRESA_CORREO: "ventas@ejemplo.cl" });
    expect(lineasEmpresa(d)).toEqual(["Neltume.co", "RUT 11.111.111-1", "Camino a Neltume s/n", "ejemplo.cl"]);
    expect(contenidoCotizacion(base, d).pie[1]).toContain("ventas@ejemplo.cl");
  });
});
