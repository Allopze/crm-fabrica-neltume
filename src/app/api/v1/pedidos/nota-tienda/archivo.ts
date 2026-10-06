import { ErrorDominio } from "@/domain/errores";
import { MAX_PDF_BYTES } from "@/domain/pedidos/pdf-texto";

/** Lee el PDF del campo «archivo» de un formulario multipart (ADR-0008: ≤ 5 MB, se valida la firma %PDF- después). */
export async function pdfDelFormulario(req: Request): Promise<{ datos: Uint8Array; form: FormData }> {
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!form || !(archivo instanceof File)) throw new ErrorDominio("VALIDACION", "Adjunta el PDF de la nota en el campo «archivo».");
  if (archivo.size > MAX_PDF_BYTES) throw new ErrorDominio("VALIDACION", "El PDF supera 5 MB.");
  return { datos: new Uint8Array(await archivo.arrayBuffer()), form };
}

export const campo = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" ? v : undefined;
};
