# ADR-0025 — Estilo de documentos Neltume v1 (PDF de la fábrica y de la tienda)

**Estado:** aceptado (25-10-2026). El usuario aprobó las Fases 22 y 23 y la fecha en palabras solo en el encabezado de los PDF (D7), y confirmó que cada app conserva sus logos, sus precios y todo lo que la diferencia: es una unificación de formato y funcionamiento, nada más (D9). Para las líneas sin código en las notas de la tienda se eligió el aviso mínimo, sin decisión suya sobre leerlas como «a pedido, revisar». El plan lo acordó el agente de la tienda con esta sesión · **Refs:** REQ-COT-4.2, 8.1, 8.6, AGENTS regla 8 y la de fechas, ADR-0004, ADR-0008, ADR-0023 §7, ADR-0024 · **Modifica:** ADR-0004 (diseño del PDF) y la regla de fechas de AGENTS (solo en el encabezado de los PDF) · **Contrato:** `docs/contratos/estilo-documentos-v1.md` y `estilo-documentos-tokens.json`, idénticos en los dos repos; los redacta el agente de la tienda y la fábrica los revisa.

## Contexto

- El usuario pidió (25-10-2026) estandarizar el estilo de los documentos de las dos apps (cotización, nota de pedido, orden de trabajo y prueba de conexión), cada una con sus atributos propios. Hoy difieren en acento, tipografías, encabezado, bloques de partes, tabla, totales, pie y formato de fechas.
- Los PDF de la fábrica no se guardan: se generan al descargar desde datos congelados (ADR-0004). Los de la tienda guardan su HTML.
- La fábrica lee el PDF «por fábrica» de la tienda por posiciones y etiquetas (`nota-tienda-fabrica.ts`, respaldo manual de ADR-0008) y valida los PDF de la API (`documentos.ts`). Un cambio de estilo de la tienda puede romper esa lectura.
- Probado el 25-10-2026 con fragmentos sintéticos de coordenadas reales: con el encabezado de la tabla repetido en la página 2, el lector acepta la nota y lee bien los ítems, pero `totales.total` queda null (toma el «Total» de la columna); nadie consume esa cifra. «N.º 323» no calza con `N[°º]` y se rechazaría la nota. Una entrega comprometida que no es fecha se pierde sin aviso en el respaldo manual (por la API pasa a las observaciones). Con un PDF sintético de la tienda de 4 páginas y 31 líneas, el respaldo lee 27: las 4 líneas de pedido especial (sin «Referencia de catálogo», precio «Por definir») se omiten sin aviso, aunque la API sí las trata como «a pedido, revisar».

## Decisión

1. **Tipografía:** Fraunces 500 (tipo, número, títulos y cifras), Instrument Sans 400/600 (texto) y JetBrains Mono 400 (código como campo propio; dentro de una frase va en la fuente del texto). Son los `.woff` estáticos de `public/marca/fuentes`, que la tienda copia byte a byte con su licencia OFL. Sin ligaduras ni guiones de partición.
2. **Colores:** tinta `#1d2b24`, gris `#58615a`, filete `#dcddd3`, fondo suave `#f2f3ec`, verde `#2d4938` (filetes, números, totales) y raulí `#9a4524` (etiquetas y avisos). Van en `estilo-documentos-tokens.json`.
3. **Página:** A4, márgenes laterales de 14 mm, filete bajo el encabezado y pie con filete y «Página N de M» a ≥ 7,5 pt.
4. **Encabezado:** logo a la izquierda; a la derecha el tipo de documento (serif, gris, 11 pt) sobre el número («N.º n», serif, 29 pt) y debajo la meta en columnas, con la etiqueta arriba y el valor abajo.
5. **Cuerpo:** bloques de partes con etiqueta chica, título serif de 15 pt y pares clave-valor; tabla con encabezado gris sin mayúsculas forzadas ni interletrado, código en mono e importes a la derecha; totales a la derecha con «Total» serif y la cifra grande en verde; observaciones sobre fondo suave (en pedido y orden de trabajo, una caja vacía para escribir a mano).
6. **Marcas:** marca de agua diagonal «ANULADA» y «PRUEBA»; metadatos Title común y Author, Creator y Producer «Neltume.co».
7. **Fechas:** en el encabezado, larga («25 de octubre de 2026»); en tablas y campos («Entrega», vigencias) se mantiene dd-mm-aaaa. La regla de AGENTS.md pasa a valer fuera del encabezado de los PDF; ese texto lo cambia el usuario o lo cambio yo solo con su instrucción directa.
8. **Contenido:** «Por definir» en lugar de «$0» en los ítems «a pedido» sin precio de la nota de pedido (no suma al total); más ancho en la columna de descripción. La orden de trabajo de la fábrica sigue sin datos personales del cliente final (ADR-0023 §7); la de la tienda queda solo con la obra (decisión suya).
9. **Logo, precios y lo propio de cada app:** cada app conserva lo que la diferencia (confirmado por el usuario el 25-10-2026: se unifican el formato y el funcionamiento, nada más). Logo: la fábrica, el logo «PUERTAS NELTUME» de `public/marca/logo-neltume.svg` (sin segundo archivo ni cambio en la web); la tienda, el suyo. El estándar fija solo dónde va el logo (solo, a la izquierda del encabezado, sin texto de la columna izquierda a la altura del tipo y el número), no cuál es. Tampoco toca los precios: cada documento imprime los de su app.
10. **Compatibilidad de lectura:** el estándar lleva una sección «No cambiar sin avisar» con las anclas que lee la fábrica (el contrato las enumera) y el lector pasa a ser tolerante: acepta «N.º» y «N°», une fragmentos contiguos de una línea, ignora las líneas de encabezado repetido y toma «Total» solo de una línea que no sea encabezado; una entrega que no es fecha va a las observaciones, como en la API. **Orden:** primero el lector tolerante, desplegado y probado con los PDF sintéticos de la tienda; después publica la tienda. El restilo de los PDF de la fábrica es independiente.
11. **Conformidad:** cada repo prueba sus propios PDF con pdfjs (familias de fuente, tamaño del pie, márgenes, colores, «Página N de M» y metadatos) y compara sus constantes con `estilo-documentos-tokens.json`.

## Consecuencias

- Una cotización o nota ya emitida se descarga con el estilo nuevo: mismos precios, texto y fecha congelados, distinto aspecto. Los PDF ya emitidos por la tienda no cambian.
- El pie de la fábrica ya cumple 7,5 pt; los márgenes pasan de 18 a 14 mm y las columnas ganan ancho.
- Dos fases: la 22 (lector tolerante, pequeña, primero) y la 23 (restilo). Cada una con su checkpoint.
- Brecha conocida de la tienda: con Chromium no puede poner Author, Creator ni Producer.
- Cualquier cambio en las anclas exige avisar a la otra parte antes de publicarlo.

## Alternativas

Tipografías de la tienda (Newsreader y Host Grotesk): descartada, el PDF dejaría de parecerse a la interfaz de la fábrica y exigiría instancias estáticas nuevas. Un logo compartido (la caja NEL/TU/ME en las dos apps): descartado, cada app conserva el suyo. Un lector que no cambia y una tienda que no repite el encabezado: descartado, el encabezado ayuda al leer en papel y el lector ya se toca.
