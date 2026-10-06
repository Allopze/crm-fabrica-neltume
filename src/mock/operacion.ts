// Materias primas, producción, movimientos y auditoría simulados.

export interface MateriaPrima { id: string; nombre: string; unidad: string; existencia: number; minimo: number; ultimaRecepcion: string }
export const materiasPrimas: MateriaPrima[] = [
  { id: "mp-1", nombre: "Tabla raulí 1\" cepillada", unidad: "pulg", existencia: 412, minimo: 300, ultimaRecepcion: "2026-10-01" },
  { id: "mp-2", nombre: "Tabla lenga 1\" cepillada", unidad: "pulg", existencia: 188, minimo: 250, ultimaRecepcion: "2026-09-22" },
  { id: "mp-3", nombre: "Tabla pino oregón 1\"", unidad: "pulg", existencia: 640, minimo: 300, ultimaRecepcion: "2026-09-29" },
  { id: "mp-4", nombre: "Tablero MDF 15 mm", unidad: "un", existencia: 36, minimo: 20, ultimaRecepcion: "2026-09-18" },
  { id: "mp-5", nombre: "Cola vinílica D3", unidad: "lt", existencia: 14, minimo: 20, ultimaRecepcion: "2026-08-30" },
  { id: "mp-6", nombre: "Barniz poliuretano", unidad: "lt", existencia: 22, minimo: 10, ultimaRecepcion: "2026-09-05" },
  { id: "mp-7", nombre: "Lija grano 120", unidad: "un", existencia: 150, minimo: 100, ultimaRecepcion: "2026-09-05" },
];

export interface LineaBom { mp: string; cantidad: number }
export interface Bom { modelo: string; medida: string; origen: "real" | "demo"; lineas: LineaBom[] }
export const boms: Bom[] = [
  { modelo: "Neltume", medida: "0,90 × 2,10 m", origen: "demo", lineas: [{ mp: "mp-1", cantidad: 6 }, { mp: "mp-5", cantidad: 0.4 }, { mp: "mp-7", cantidad: 3 }] },
  { modelo: "Molco", medida: "0,70 × 2,10 m", origen: "demo", lineas: [{ mp: "mp-2", cantidad: 5 }, { mp: "mp-4", cantidad: 0.5 }, { mp: "mp-5", cantidad: 0.3 }] },
  { modelo: "Ancacomoe", medida: "0,80 × 2,00 m", origen: "demo", lineas: [{ mp: "mp-3", cantidad: 5.5 }, { mp: "mp-5", cantidad: 0.35 }] },
];

export interface Orden { id: string; numero: number; articulo: string; cantidad: number; estado: "abierta" | "cerrada"; pedido?: number; creada: string }
export const ordenes: Orden[] = [
  { id: "op-31", numero: 31, articulo: "PAL-R-4-B", cantidad: 3, estado: "abierta", pedido: 57, creada: "2026-10-02" },
  { id: "op-30", numero: 30, articulo: "NEL-R-4-B", cantidad: 2, estado: "abierta", creada: "2026-10-01" },
  { id: "op-29", numero: 29, articulo: "ANC-O-3-A", cantidad: 6, estado: "cerrada", creada: "2026-09-26" },
];

export type TipoMov = "Entrada producción" | "Salida despacho" | "Ajuste" | "Reserva" | "Liberación" | "Recepción" | "Consumo producción";
export interface Movimiento { fecha: string; tipo: TipoMov; cantidad: number; ref: string; usuario: string; motivo?: string }
export const movimientosDemo: Movimiento[] = [
  { fecha: "2026-10-04T17:12:00", tipo: "Reserva", cantidad: 3, ref: "Pedido 57", usuario: "Paula R." },
  { fecha: "2026-10-03T11:30:00", tipo: "Entrada producción", cantidad: 4, ref: "Orden 28", usuario: "Paula R." },
  { fecha: "2026-09-29T09:05:00", tipo: "Ajuste", cantidad: -1, ref: "Conteo cíclico", usuario: "Paula R.", motivo: "Puerta con grieta en panel, descartada" },
  { fecha: "2026-09-20T15:44:00", tipo: "Salida despacho", cantidad: -2, ref: "Pedido 54", usuario: "Paula R." },
];

export interface EventoAuditoria { fecha: string; actor: string; accion: string; recurso: string; resultado: "ok" | "denegado" | "error"; detalle: string }
export const auditoria: EventoAuditoria[] = [
  { fecha: "2026-10-05T10:44:12", actor: "Paula R.", accion: "editar ítem", recurso: "Cotización 124", resultado: "ok", detalle: "i2: cantidad 2 → 2, estado sin cambio" },
  { fecha: "2026-10-05T10:42:03", actor: "Paula R.", accion: "interpretar pedido", recurso: "Cotización 124", resultado: "ok", detalle: "IA: 3 ítems, 1 alerta · 4,8 s · US$ 0,011" },
  { fecha: "2026-10-05T09:15:40", actor: "visitante", accion: "login", recurso: "Sesión", resultado: "denegado", detalle: "Credenciales inválidas · 190.x.x.x" },
  { fecha: "2026-10-04T17:12:00", actor: "Paula R.", accion: "crear pedido", recurso: "Pedido 57", resultado: "ok", detalle: "Reserva 3 de 6 PAL-R-4-B; faltan 3" },
  { fecha: "2026-10-04T12:20:31", actor: "Paula R.", accion: "nueva versión", recurso: "Lista de precios v3", resultado: "ok", detalle: "Recargo Especial 0,18 → 0,20" },
  { fecha: "2026-09-29T09:05:10", actor: "Paula R.", accion: "ajuste", recurso: "PAL-R-4-B", resultado: "ok", detalle: "−1 · Puerta con grieta en panel" },
];
