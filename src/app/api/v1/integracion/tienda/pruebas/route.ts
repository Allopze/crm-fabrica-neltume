import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { armarPruebaSaliente, codigoCorto } from "@/domain/integracion-tienda/conexion";
import { estadoConexion, solicitarPruebaEnviada } from "@/domain/integracion-tienda/conexion-datos";
import { configEnvio } from "@/domain/integracion-tienda/firma";
import { pdfPruebaConexion } from "@/domain/pdf/prueba-conexion";

export const dynamic = "force-dynamic";
const privado = { "cache-control": "private, no-store" };

// GET /api/v1/integracion/tienda/pruebas — estado de la conexión y las últimas pruebas de los dos sentidos, sin los PDF (REQ-ADM-5.3)
export const GET = conPermiso("config.editar", async () => NextResponse.json(await estadoConexion(bd()), { headers: privado }));

// POST /api/v1/integracion/tienda/pruebas — «Enviar PDF de prueba a la tienda»: la app genera y firma el PDF y deja la
// solicitud en la BD; el servicio de enlace la reenvía, porque la app no sale a internet (ADR-0024 §3, REQ-ADM-5.1). 202.
export const POST = conPermiso("config.editar", async ({ actor, correlacionId }) => {
  const envio = configEnvio();
  if (!envio) throw new ErrorDominio("INTEGRACION_APAGADA", "Falta configurar INTEGRACION_TIENDA_SECRETO en la app: sin él no se puede firmar la prueba.");
  const eventId = randomUUID();
  const ahora = new Date();
  const pdf = await pdfPruebaConexion({ codigo: codigoCorto(eventId), fabrica: envio.fabrica, creadaEn: ahora });
  const prueba = armarPruebaSaliente({ secreto: envio.secreto, fabrica: envio.fabrica, pdf, eventId, ahora });
  const { id } = await bd().transaction((tx) => solicitarPruebaEnviada(tx, { actor, prueba, pdf, correlacionId }));
  return NextResponse.json({ id, estado: "pendiente" }, { status: 202, headers: privado });
}, { idempotente: true });
