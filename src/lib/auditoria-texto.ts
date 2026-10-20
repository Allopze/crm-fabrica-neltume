// Lectura humana del registro de auditoría (REQ-ADM-3.2): acciones, recursos y detalle en español y formato chileno.
// El registro guarda los datos tal cual; esto solo cambia cómo se muestran.
import { clp, fecha, fechaHora, numero } from "./formato";

const RECURSOS: Record<string, string> = {
  alias_modelo: "Alias de modelo", api: "Acceso", articulo: "Puerta o accesorio", bom: "Receta (BOM)", cliente: "Cliente",
  configuracion: "Configuración", cotizacion: "Cotización", feriado: "Feriado", importacion: "Importación del Excel",
  lista_precio: "Lista de precios", madera_insumo: "Madera de la puerta", materia_prima: "Materia prima", nota_pedido: "Nota de pedido",
  orden_produccion: "Orden de producción", rol: "Rol", sesion: "Sesión", usuario: "Usuario",
};

const ACCIONES: Record<string, string> = {
  login: "Ingreso", logout: "Salida", crear: "Creación", actualizar: "Cambio", anular: "Anulación", aprobar: "Aprobación", cerrar: "Cierre",
  recalcular: "Recálculo con la lista vigente", interpretar: "Interpretación de la IA", "interpretar (encolar)": "Pedido enviado a la IA",
  "crear manual": "Creación a mano", "agregar ítem por confirmar": "Ítem por confirmar agregado", "quitar ítem": "Ítem quitado", "aplicar descuento": "Descuento", "definir bom": "Receta definida",
  "asociar madera": "Madera asociada", "importar excel": "Importación del Excel", recepcion: "Recepción", ajuste: "Ajuste",
  consumo_produccion: "Consumo de producción", entrada_produccion: "Entrada de producción", salida_despacho: "Salida por despacho",
  reserva: "Reserva", liberacion: "Liberación de reserva", "crear pedido": "Nota de pedido creada", "cancelar pedido": "Cancelación",
  "pedido en produccion": "Pasó a producción", "pedido lista": "Lista para despacho", "pedido despachada": "Despacho",
};

const METODOS: Record<string, string> = { GET: "Consultar", POST: "Registrar", PATCH: "Modificar", PUT: "Reemplazar", DELETE: "Eliminar" };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function textoRecurso(recurso: string): string {
  return RECURSOS[recurso] ?? capital(recurso.replace(/_/g, " "));
}

/** «POST /api/v1/ordenes/<id>/cerrar» → «Registrar /ordenes/…/cerrar»; el resto, por tabla o sin guiones bajos. */
export function textoAccion(accion: string): string {
  const http = /^(GET|POST|PATCH|PUT|DELETE) \/api\/v1(\/\S*)$/.exec(accion);
  if (http) return `${METODOS[http[1]]} ${http[2].replace(UUID, "…")}`;
  return ACCIONES[accion] ?? capital(accion.replace(/_/g, " "));
}

const CAMPOS: Record<string, string> = {
  activo: "Activo", cantidad: "Cantidad", codigo: "Código", comuna: "Comuna", contacto: "Contacto", creadas: "Creadas", descripcion: "Descripción",
  descuento: "Descuento", descuentoPct: "Descuento (%)", direccion: "Dirección", direccionDespacho: "Dirección de despacho", email: "Correo",
  estado: "Estado", faltante: "Faltante", filasCorregidas: "Filas corregidas", filasRechazadas: "Filas rechazadas", giro: "Giro", items: "Ítems",
  iva: "IVA", largoTexto: "Largo del texto", lineas: "Líneas", listaVersion: "Versión de lista", madera: "Madera", medida: "Medida",
  modelo: "Modelo", motivo: "Motivo", neto: "Neto", nombre: "Nombre", numero: "N.º", orden: "Orden", origen: "Origen", rechazadas: "Rechazadas",
  reservado: "Reservado", rut: "RUT", stockMinimo: "Mínimo", subtotal: "Subtotal", telefono: "Teléfono", tipo: "Tipo", total: "Total",
  unidades: "Unidades", unidadCodigo: "Unidad", vigenciaHasta: "Vigente hasta", actualizadas: "Actualizadas", aPedidoConfirmados: "A pedido confirmados",
  liberado: "Liberado", insumos: "Insumos", sinCambios: "Sin cambios", archivo: "Archivo",
};
const MONTOS = new Set(["total", "subtotal", "iva", "neto", "descuento"]);
// Ids internos y huellas no le dicen nada a quien lee el registro: se omiten del detalle.
const OCULTOS = new Set(["id", "hash", "movimiento", "materiaPrimaId", "rolId", "ref", "creadoEn", "actualizadoEn", "bom", "item", "cotizacion"]);

// Códigos de error de la API (API.md §2) como los leería una persona.
const ERRORES: Record<string, string> = {
  INSUMOS_INSUFICIENTES: "faltan insumos", VALIDACION: "datos inválidos", SIN_BOM: "sin receta", BOM_INCOMPLETO: "receta incompleta",
  ORDEN_CERRADA: "la orden ya estaba cerrada", STOCK_INSUFICIENTE: "stock insuficiente", ITEMS_POR_CONFIRMAR: "quedan ítems por confirmar",
  NO_APROBADA: "la cotización no está aprobada", VENCIDA: "la cotización venció", YA_TIENE_PEDIDO: "ya tenía nota de pedido",
  NO_EDITABLE: "ya no se puede modificar", CONFLICTO: "otra persona la cambió antes", PROHIBIDO: "sin permiso", NO_ENCONTRADO: "no existe",
  ULTIMO_ADMIN: "es el último usuario que administra", YA_IMPORTADA: "la nota ya se había cargado", LIMITE_IA: "límite de uso de la IA",
  VERSION_OBSOLETA: "otra persona la cambió antes", NOTA_ILEGIBLE: "no se pudo leer la nota", TEXTO_DEMASIADO_LARGO: "texto demasiado largo",
  CAMPO_NO_PERMITIDO: "campo no permitido", IDEMPOTENCIA_CONFLICTO: "envío repetido con otros datos", IDEMPOTENCIA_REQUERIDA: "falta la clave de envío",
  INTERNO: "error interno",
};

function valor(clave: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^[A-Z]+(_[A-Z]+)*$/.test(v) && ERRORES[v]) return ERRORES[v];
  if (typeof v === "boolean") return v ? "sí" : "no";
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
  if (n !== null) return MONTOS.has(clave) ? clp(n) : numero(n);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return fechaHora(v);
    return v.replace(UUID, "…");
  }
  if (Array.isArray(v)) return v.length === 1 ? "1 elemento" : `${numero(v.length)} elementos`;
  return detalle(v).map(([k, x]) => `${k}: ${x}`).join(", ") || "—";
}

/** Pares campo–valor legibles de un objeto del registro (antes o después). */
export function detalle(v: unknown): [string, string][] {
  if (v === null || v === undefined) return [];
  if (typeof v !== "object" || Array.isArray(v)) return [["Valor", valor("", v)]];
  return Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !OCULTOS.has(k))
    .map(([k, x]) => [CAMPOS[k] ?? capital(k.replace(/([A-Z])/g, " $1").toLowerCase()), valor(k, x)]);
}

/** Resumen de una línea para la tabla: hasta tres campos. */
export function resumenDetalle(v: unknown): string {
  const pares = detalle(v);
  const t = pares.slice(0, 3).map(([k, x]) => `${k}: ${x}`).join(" · ");
  return pares.length > 3 ? `${t} · …` : t;
}
