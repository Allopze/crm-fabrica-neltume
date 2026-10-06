import { NextResponse } from "next/server";
import { conPermiso, MAX_CUERPO_ARCHIVO } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { importarExcel } from "@/domain/importacion/importar";

const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/v1/importaciones — multipart con el campo "archivo" (.xlsx ≤ 5 MB) (REQ-STK-1.1–1.3, REQ-COT-1.1)
export const POST = conPermiso(["catalogo.editar", "precios.editar"], async ({ req, actor }) => {
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) throw new ErrorDominio("VALIDACION", "Adjunta el Excel en el campo «archivo».");
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) throw new ErrorDominio("VALIDACION", "El archivo debe ser .xlsx.");
  if (archivo.size > MAX_BYTES) throw new ErrorDominio("VALIDACION", "El archivo supera 5 MB.");
  const informe = await importarExcel(await archivo.arrayBuffer(), archivo.name, actor);
  return NextResponse.json(informe, { status: informe.repetida ? 200 : 201 });
}, { idempotente: true, maxCuerpo: MAX_CUERPO_ARCHIVO });
