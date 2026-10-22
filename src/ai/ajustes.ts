// Ajustes guarda proveedor/modelo; las claves se resuelven solo desde el entorno privado del worker.
import { eq } from "drizzle-orm";
import { bd, type Tx } from "@/db/conexion";
import { parametro } from "@/db/esquema/catalogo";
import { registrarAuditoria, type Actor } from "@/domain/auditoria";
import { ErrorDominio } from "@/domain/errores";
import type { TipoProveedor } from "./interfaz";
import { perfilRazonamiento } from "./razonamiento";

const CLAVE_CONFIG = "ia.proveedores.config";
const CLAVE_CATALOGO = { commandcode: "ia.catalogo.commandcode" } as const;
/** Proveedores que se pueden activar (ADR-0022: Groq se retiró; la interfaz sigue siendo agnóstica, ADR-0001). */
export const PROVEEDORES = ["commandcode"] as const;
export type ProveedorConfigurado = Exclude<TipoProveedor, "doble">;
export interface ModeloIA {
  id: string; nombre: string; compatible: boolean; preview: boolean; motivo?: string;
  precioEntradaUsdMTok?: number; precioSalidaUsdMTok?: number;
  modoRazonamiento?: string; modeloEfectivo?: string;
}
export interface CatalogoIA { actualizadoEn: string | null; fuente: string; modelos: ModeloIA[] }
export interface EstadoAjustesIA {
  proveedor: ProveedorConfigurado | null; modelo: string | null;
  catalogos: Record<ProveedorConfigurado, CatalogoIA>;
}
export interface ConfiguracionPrivadaIA {
  version: 1; proveedor: ProveedorConfigurado | null; modelo: string | null; actualizadoEn: string;
}

const catalogoVacio = (): CatalogoIA => ({ actualizadoEn: null, fuente: "https://commandcode.ai/docs/resources/pricing-limits", modelos: [] });
const configVacia = (): ConfiguracionPrivadaIA => ({ version: 1, proveedor: null, modelo: null, actualizadoEn: new Date(0).toISOString() });
const esProveedor = (p: unknown): p is ProveedorConfigurado => (PROVEEDORES as readonly unknown[]).includes(p);

function leerObjeto<T>(valor: unknown, fallback: T): T {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as T : fallback;
}
export async function leerConfiguracionPrivada(tx: Tx = bd()): Promise<ConfiguracionPrivadaIA> {
  const [fila] = await tx.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, CLAVE_CONFIG));
  const c = leerObjeto<Partial<Record<keyof ConfiguracionPrivadaIA, unknown>>>(fila?.valor, {});
  // Solo se leen los campos vigentes: un dato extra (p. ej. de un borrador anterior) se ignora. Un proveedor que ya no
  // existe (Groq, ADR-0022) se lee como «sin proveedor»: el worker no lo usa y Ajustes pide elegir un modelo.
  const proveedor = esProveedor(c.proveedor) ? c.proveedor : null;
  return {
    version: 1, proveedor, modelo: proveedor && typeof c.modelo === "string" ? c.modelo : null,
    actualizadoEn: typeof c.actualizadoEn === "string" ? c.actualizadoEn : configVacia().actualizadoEn,
  };
}
export async function leerCatalogo(p: ProveedorConfigurado, tx: Tx = bd()): Promise<CatalogoIA> {
  const [fila] = await tx.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, CLAVE_CATALOGO[p]));
  const c = leerObjeto<CatalogoIA>(fila?.valor, catalogoVacio());
  return { ...catalogoVacio(), ...c, modelos: Array.isArray(c.modelos) ? c.modelos : [] };
}
export async function escribirCatalogo(p: ProveedorConfigurado, catalogo: CatalogoIA, tx: Tx = bd()) {
  await tx.insert(parametro).values({ clave: CLAVE_CATALOGO[p], valor: catalogo }).onConflictDoUpdate({ target: parametro.clave, set: { valor: catalogo } });
}

/** Muestra el modo efectivo sin alterar la compatibilidad del catálogo. */
export function modeloConPolitica(proveedor: ProveedorConfigurado, modelo: ModeloIA): ModeloIA {
  const perfil = perfilRazonamiento(proveedor, modelo.id);
  return { ...modelo, modoRazonamiento: perfil.modo, modeloEfectivo: perfil.modeloEfectivo };
}

export async function estadoAjustesIA(): Promise<EstadoAjustesIA> {
  const [config, commandcode] = await Promise.all([leerConfiguracionPrivada(), leerCatalogo("commandcode")]);
  return {
    proveedor: config.proveedor, modelo: config.modelo,
    catalogos: { commandcode: { ...commandcode, modelos: commandcode.modelos.map((m) => modeloConPolitica("commandcode", m)) } },
  };
}

const VARIABLE_API_KEY: Record<ProveedorConfigurado, string> = { commandcode: "CMD_API_KEY" };

/** La clave del proveedor solo se lee en procesos autorizados de IA, nunca desde la app web. */
export function apiKeyDesdeEntorno(proveedor: ProveedorConfigurado): string | undefined {
  const valor = process.env[VARIABLE_API_KEY[proveedor]]?.trim();
  return valor || undefined;
}

export async function claveActivaParaWorker(config: ConfiguracionPrivadaIA): Promise<{ proveedor: ProveedorConfigurado; modelo: string; apiKey: string } | null> {
  if (!config.proveedor || !config.modelo) return null;
  const apiKey = apiKeyDesdeEntorno(config.proveedor);
  if (!apiKey) throw new Error(`Falta ${VARIABLE_API_KEY[config.proveedor]} en .env.worker.local`);
  return { proveedor: config.proveedor, modelo: config.modelo, apiKey };
}

export interface EntradaAjustesIA {
  proveedorActivo?: ProveedorConfigurado;
  modelo?: string;
}

/** Guarda proveedor/modelo; las claves viven en el entorno del worker. */
export async function guardarAjustesIA(entrada: EntradaAjustesIA, actor: Actor, correlacionId: string) {
  return bd().transaction(async (tx) => {
    const antes = await leerConfiguracionPrivada(tx);
    const proveedor = entrada.proveedorActivo ?? antes.proveedor;
    const modelo = entrada.proveedorActivo ? entrada.modelo ?? null : antes.modelo;
    if (entrada.proveedorActivo) {
      if (!modelo) throw new ErrorDominio("VALIDACION", "Selecciona un modelo compatible antes de activar el proveedor.");
      const catalogo = await leerCatalogo(entrada.proveedorActivo, tx);
      const encontrado = catalogo.modelos.find((m) => m.id === modelo);
      const seleccionado = encontrado && modeloConPolitica(entrada.proveedorActivo, encontrado);
      if (!seleccionado) throw new ErrorDominio("VALIDACION", "El modelo no pertenece al catálogo actualizado del proveedor.");
      if (!seleccionado.compatible || seleccionado.preview) throw new ErrorDominio("VALIDACION", seleccionado.motivo ?? "Ese modelo no se puede activar para el cotizador.");
    }
    const despues: ConfiguracionPrivadaIA = { version: 1, proveedor, modelo, actualizadoEn: new Date().toISOString() };
    await tx.insert(parametro).values({ clave: CLAVE_CONFIG, valor: despues }).onConflictDoUpdate({ target: parametro.clave, set: { valor: despues } });
    await registrarAuditoria(tx, {
      actor, accion: "actualizar ajustes de IA", recurso: "configuracion", recursoId: "ia",
      antes: resumenAuditable(antes), despues: resumenAuditable(despues), resultado: "ok", origen: "web", correlacionId,
    });
    return { proveedor: despues.proveedor, modelo: despues.modelo };
  });
}

function resumenAuditable(c: ConfiguracionPrivadaIA) {
  return { proveedor: c.proveedor, modelo: c.modelo };
}

export function modeloSeleccionable(modelo: ModeloIA | undefined) {
  return Boolean(modelo?.compatible && !modelo.preview);
}
