# ADR-0008 — Pedido directo desde el PDF de la nota de pedido de la tienda

**Estado:** aceptado (Fase 5, 06-10-2026); **complementado por ADR-0023** (24-10-2026): las notas llegan solas por la API firmada y la carga del PDF queda como respaldo; el lector reconoce también el formato «por fábrica» del 23-10-2026 · **Refs:** REQ-COT-8.6–8.9, REQ-NFR-5, ADR-0003, SECURITY T9

## Contexto
La tienda (Neltume.co) cotiza a sus clientes con su propio cotizador y, cuando el cliente paga el anticipo, le envía a la fábrica una **nota de pedido en PDF** con los mismos códigos del catálogo, cantidades, precio de venta, medida solicitada y despacho. Hoy la fábrica solo puede crear pedidos desde una cotización propia y tendría que transcribir la nota a mano.

## Decisión
- La nota se **sube como PDF** en la webapp (el único canal sigue siendo la webapp, ADR-0003) y se lee de forma **determinista, sin IA**, con `pdfjs-dist` 6 (solo texto con posiciones; no evalúa código del PDF, sin XFA ni fuentes del sistema).
- **Lector** puro (`src/domain/pedidos/nota-tienda.ts`):
  - Reconoce el número de nota, la fecha, la referencia de cotización y el despacho (dirección, transporte, proyecto, entrega comprometida).
  - En cada fila toma el código del catálogo, la cantidad, el precio unitario, el total y la «Medida solicitada».
  - Las columnas se ubican por la posición de sus encabezados.
  - Valida que cantidad × unitario = total y que la suma cuadre con el subtotal.
  - Una nota marcada «ANULADA» se rechaza.
- **Vista previa obligatoria y confirmación humana.** Al confirmar, el servidor vuelve a leer el archivo: nunca confía en ítems editados en el navegador.
- **Precio:** la venta de la lista vigente **sin recargo** (NC-12). Si la nota trae otro precio, se avisa y prevalece la lista; la diferencia la resuelve una persona.
- **Cliente:** el del pedido es la tienda (cliente de tipo `tienda`). **No se guardan los datos personales del cliente final** (nombre, RUT, giro, dirección, teléfono); del despacho solo se toman dirección, transporte y proyecto (REQ-NFR-5).
- **Duplicados:** se rechaza la misma nota (mismo hash o mismo número para la misma tienda) con 409 `YA_IMPORTADA`. Los códigos inexistentes o inactivos bloquean la confirmación.
- **Pedido:** origen `nota_tienda`, sin cotización (`cotizacion_id` nulo), con `ref_externa` = N° de la nota. Reserva igual que un pedido desde cotización: el núcleo es compartido.

## Consecuencias
- La fábrica no transcribe: sube el PDF, revisa y confirma.
- El lector depende del formato del PDF del cotizador de la tienda. Si cambia, falla con un mensaje claro y la vista previa no deja confirmar; se ajusta el lector con un test sobre la nueva muestra.
- Superficie nueva: archivo subido no confiable. Mitigaciones: máximo 5 MB, verificación de la firma `%PDF-`, `pdfjs-dist` sin XFA, solo extracción de texto y sin guardar el archivo (se guarda su hash).

## Alternativas
- Pegar el texto copiado del PDF: depende de cómo copie cada visor.
- Ingreso manual por código: lo más lento.
- Integración directa con la base de la tienda: acopla dos sistemas y requiere red entre ellos.
- Usar la IA para leer la nota: innecesario, porque los códigos ya son exactos.
