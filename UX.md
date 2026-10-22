# UX.md — Pantallas y estados

Uso principal en PC (≥ 1280 px); las pantallas deben poder leerse en celular, sin flujos propios (REQ-NFR-6). Español, CLP con separador de miles ($1.234.567) y fechas dd-mm-aaaa. Las fechas y horas con zona se muestran en America/Santiago, nunca en UTC.

Documentos con un solo formato de número, igual en pantalla y en PDF: «Cotización N.º 7», «Nota de pedido N.º 1», «Orden N.º 3»; en una columna «N.º» basta el número. Cada página abre con su título y, si hace falta, una línea de contexto (fecha, origen) debajo; sin antetítulos. Nunca se muestran ids internos, claves de permiso ni nombres de archivos de configuración: se nombra el documento (con enlace) o la acción en español.

## 1. Mapa de pantallas

| Sección | Pantalla | Permiso | Refs |
|---|---|---|---|
| Acceso | Login | público | REQ-ADM-1 |
| Inicio | Panel: cotizaciones en borrador, alertas de stock y de MP, pedidos con faltante | sesión | — |
| Cotizador | **Nueva cotización** (pegar texto) → **Revisión** (lado a lado) → Aprobada (PDF) | `cotizaciones.*` | REQ-COT-2, 3, 4 |
| Cotizador | Cotización manual | `cotizaciones.crear` | REQ-COT-5 |
| Cotizador | Lista y búsqueda de cotizaciones | `cotizaciones.crear` | REQ-COT-10 |
| Pedidos | Lista · Detalle (reservado, faltante; avance: producir faltante, completar reserva, marcar lista, despachar eligiendo las puertas —vienen marcadas las más antiguas—; despacho y entrega comprometida) · Crear desde cotización · Desde nota de la tienda (subir PDF → vista previa → confirmar) | `pedidos.gestionar` | REQ-COT-8, REQ-STK-4.4, 7 |
| Stock | Pestañas: Artículos (consulta con filtros; detalle con sus puertas en stock y movimientos) · Puertas (código, ubicación, calidad, estado; filtros) · Despachos anteriores (planilla, solo lectura) | `stock.ver` | REQ-STK-2, 8.6, 10.2 |
| Stock | Ficha de una puerta: datos editables, apartar, liberar, salida con documento, dar de baja o devolver, historia completa | `stock.mover`, `stock.ajustar` | REQ-STK-8 |
| Stock | Registrar entrada / salida / ajuste, con etiquetas opcionales y ubicación de lo que entra | `stock.mover`, `stock.ajustar` | REQ-STK-3..5, 8.2–8.3 |
| Materias primas | Lista con búsqueda y filtro «bajo el mínimo» · Recepción (también desde «Recibir» en la fila) · Ajuste · Conteo · Compras (Chipax) | `mp.*`, `stock.ajustar` | REQ-MP |
| Producción | Pestañas: Órdenes (crear y cerrar) · Recetas (BOM) · Madera de la puerta | `produccion.gestionar`, `mp.editar` | REQ-MP |
| Precios | Precios vigentes con filtros (código o modelo, madera, tipo, alto) · Versiones · Recargos · Editar (nueva versión) · Importar Excel con informe | `precios.editar`, `catalogo.editar` | REQ-COT-1, REQ-STK-1 |
| Clientes | Lista · Ficha (datos, cotizaciones y notas) | `clientes.*` | REQ-COT-9 |
| Administración | Usuarios · Roles y permisos · Auditoría · Métricas IA · Feriados · Ajustes de IA (proveedor, modelo y privacidad de datos; claves en el entorno privado del servidor) | `usuarios.gestionar`, `auditoria.ver`, `config.editar` | REQ-ADM |

Navegación lateral fija desde 1024 px; en pantallas más angostas se abre como cajón con el botón de menú (Esc lo cierra). Al pie de la barra, el nombre de quien usa la app abre su menú (cambiar contraseña, cerrar sesión). Para quien puede cotizar, la entrada «desde texto» está siempre visible arriba, como acceso secundario para no competir con la acción principal de cada pantalla; las listas solo agregan «Cotizar a mano». En celular las tablas ocultan las columnas secundarias y conservan número, cliente o artículo, estado y total o disponible. Sin buscador global: cada lista tiene su propio filtro. Las tablas anchas se desplazan dentro de su marco (también con teclado) y la página nunca se desplaza hacia el costado; en pantallas táctiles los controles miden al menos 44 px.

Los selectores usan el campo de la plataforma y abren un menú integrado con las opciones. Se operan con flechas, Inicio/Fin, búsqueda por letra, Enter o Espacio y se cierran con Esc; muestran foco visible y conservan su valor al enviar o reiniciar un formulario (REQ-NFR-6). Con más de 10 opciones (clientes, recursos) el menú trae un buscador, y nunca se sale de la pantalla. Una opción vacía que invita a elegir («Elegir cliente…») se ve atenuada; ningún formulario de movimientos parte con una materia prima ya elegida.

Las fechas se escriben dd-mm-aaaa (también con / o .) o se eligen en un calendario propio (flechas, RePág/AvPág, Esc): nunca el selector del navegador, que cambia de formato según su idioma. Las medidas se leen en metros en todas las pantallas («0,90 × 2,00»).

Listas: los filtros se aplican solos (el texto, al dejar de escribir); el pie dice cuántos hay con esos filtros, con «Volver al inicio» y la página siguiente; la fila se abre con un clic en cualquier parte; las tablas largas dejan el encabezado a la vista, avisan con una sombra cuando hay columnas fuera de vista, y Stock › Artículos se ordena por columna. Los formularios que se abren desde el encabezado (movimientos de stock, nueva materia prima, nuevo cliente, feriado adicional) van en un panel lateral: la página no se mueve.

## 2. Estados comunes (toda pantalla)

| Estado | Comportamiento |
|---|---|
| Vacío | Mensaje y acción principal ("Aún no hay cotizaciones. Pega un pedido para empezar.") |
| Carga | Esqueletos con la forma de la tabla en las listas largas; botones en espera con texto ("Interpretando pedido…"); nunca un spinner sin texto |
| Hecho | Confirmación breve con ✓ junto a la acción ("Recepción registrada."), siempre con el mismo aspecto |
| Error | Mensaje en español con la acción sugerida; el código para soporte solo en errores inesperados (del servidor), no en los de datos o credenciales; los datos ingresados se conservan |
| Sin permiso | "No tienes permiso para esta acción." La opción no aparece en el menú; si se llega por URL, el backend responde 403/404 |
| Sin conexión | Banner "Sin conexión: los cambios no se guardaron". Los botones de guardar se deshabilitan y nada se marca como guardado sin confirmación del servidor. Al reconectar se reintenta solo lo idempotente |
| Conflicto (409) | "Otra persona cambió esta cotización. Recarga para ver la versión actual." |

## 3. Revisión de cotización (pantalla clave de la demo)

```
┌ Cotización #0123 · Borrador · Lista v3 · Cliente: [elegir ▾] ───────────────┐
│ TEXTO ORIGINAL (tal como llegó)  │ LO QUE ENTENDIÓ LA IA → ÍTEMS               │
│ "3 puertas Neltume en raulí de   │ ✅ NEL-R-4-B Neltume Raulí 0,90×2,10  ×3     │
│  90x210, y 2 de roble con chapa" │    $·.···.··· c/u  · ⚠ disponible 1, faltan 2│
│  ▓ resaltado del fragmento ▓     │ ❓ Por confirmar: "2 de roble con chapa"      │
│                                  │    Roble no existe; chapa no está en catálogo│
│                                  │    [Elegir artículo] [Eliminar]              │
│ ⚠ Alerta: el texto contiene      │ ✏ A pedido: Tolten 0,87×2,15 · ref. $·.··· │
│  instrucciones (descuento 90 %)  │    [Fijar precio]                            │
├──────────────────────────────────┴──────────────────────────────────────────────┤
│ Subtotal · Descuento (motivo) · IVA 19 % · Total         Vigencia: 10 días háb.│
│ [Agregar ítem] [Recalcular con lista vigente]   [Aprobar] (deshabilitado: 1 ❓) │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- Al pasar sobre un ítem o al enfocar uno de sus controles se resalta su `texto_fuente` en el texto original.
- Si la cantidad del ítem no coincide con la cifra del fragmento original, se resalta para que el revisor la confirme.
- Todo texto que venga de la IA (dudas, alertas, fragmentos) se muestra como texto escapado, nunca como HTML.
- `❓ por confirmar` y `✏ a pedido` usan color y texto (no solo color) y no se pueden aprobar hasta resolverlos (REQ-COT-3.3). El botón Aprobar indica cuántos quedan.
- El aviso de stock es informativo y nunca bloquea (REQ-COT-2.6): va en tono neutro, con ícono y texto. El ámbar queda para lo que bloquea la aprobación (`por confirmar`), para que no se acostumbre a ignorarlo.
- La cantidad se escribe en el campo entre − y + (1 a 500): Enter o salir del campo guarda, Esc vuelve al valor guardado.
- El botón Aprobar y su motivo quedan fijos al pie de la pantalla mientras se revisan los ítems. Una cotización manual (sin texto del cliente) muestra los ítems a la izquierda y, a la derecha, un resumen fijo con el cliente, los totales, el descuento y Aprobar, como la pantalla de cotización manual. Sin ítems, los totales dicen «—».
- Cada ítem del catálogo muestra su código. Quitar un ítem pide confirmación en línea. El buscador de artículos muestra la medida y, si hay más resultados que los que muestra, pide seguir con el código.
- Si la lista de la cotización no es la vigente, aparece un banner con "Recalcular" (REQ-COT-6.3).
- Sugerencias del texto (REQ-COT-2.18–2.20), en tono pizarra o neutro porque no bloquean: «Por el RUT del texto, parece de …» con [Asignar cliente] (o un botón por cliente si coinciden varios); «El texto trae el RUT …, que no está registrado» con [Crear cliente]; en ámbar, «¿Repetida? N.º … (borrador, dd-mm-aaaa, mismo texto)» con enlace; y «El cliente pide plazo: «…» → dd-mm-aaaa», que se repite al convertir en pedido.
- Si la IA falló, el panel derecho muestra "No pudimos interpretar el pedido" y [Cotizar a mano], con el texto conservado (REQ-COT-2.7). Se puede agregar un artículo del catálogo o una línea libre «por confirmar»; ninguna de las dos se completa en silencio.
- Al aprobar se muestra un resumen de confirmación en línea (ítems, cliente, total, lista congelada y la vigencia configurada en días hábiles) con [Confirmar aprobación] y [Volver a revisar]; luego la vista queda en solo lectura (cantidades y cliente como texto) con «Aprobada por … el dd-mm-aaaa hh:mm», [Descargar PDF] y [Convertir en pedido]; si ya tiene nota de pedido, enlaza a ella. Una aceptada dice «En nota de pedido»; si ese pedido se canceló, «Nota de pedido cancelada».
- En «Nueva cotización», Ctrl + Enter (⌘ + Enter) envía el texto a interpretar.
- Mientras interpreta, el panel derecho dice "Interpretando… (hasta 15 s)". Si pasa de 30 s deja de consultar y ofrece [Volver a consultar], [Copiar texto] y [Cotizar a mano]. Si el envío falla antes de crear la cotización, el texto queda en el cuadro y se ofrece copiarlo.

## 4. Otros detalles

- **Consulta de stock:** una tabla con existencia, reservado y disponible; bajo el mínimo en ámbar con texto "bajo mín."; sin mínimo definido, la columna de nivel dice "sin mínimo" en vez de dibujar la barra. En el detalle, cada movimiento nombra su referencia («Nota de pedido N.º 1», «Orden N.º 3», con enlace) y la reserva o liberación se lee aparte («2 reservadas»), sin signo de entrada o salida.
- **Auditoría:** acciones, recursos y resultados en español; el detalle muestra pares campo–valor (antes y después) con montos, cifras y fechas en formato chileno, sin ids internos; los códigos de error se leen en palabras. Las filas de una misma operación (misma transacción) se agrupan bajo la primera.
- **Selector de archivo:** botón y texto en español («Elegir PDF», «Ningún archivo elegido»), no el control nativo del navegador. Un recuadro punteado (Importar Excel) acepta soltar el archivo encima.
- **Nota de pedido:** «Cancelar pedido» va al pie del panel de avance, lejos del PDF. Despachada, cada ítem dice cuántas se despacharon (sin «reservadas»).
- **Compras (Chipax)** (ADR-0021): página `/materias-primas/compras`, con enlace desde Materias primas.
  - Arriba, la última sincronización (hora, resultado, facturas leídas, líneas recibidas, por asociar y por revisar) y «Sincronizar ahora».
  - Luego **Por asociar**: cada línea con proveedor, folio, ítem tal como lo escribió el proveedor, cantidad y unidad. Se elige la materia prima y el factor (con una vista previa: «12 m³ × 424 = 5.088 pulg»), y se elige «Asociar y recibir» o «No es materia prima».
  - **Por revisar**, con el motivo (unidad distinta, nota de crédito, rechazada en Chipax) y un enlace a Ajuste.
  - El historial de facturas con su estado y, con `costos.ver`, el precio de compra.
  - La lista de **proveedores habilitados**: RUT, nombre, «desde» y activar o desactivar.
  - En Recepción, al elegir una materia prima que ya entra desde Chipax: «Esta materia prima entra sola con las facturas de <proveedor>; regístrala a mano solo si no viene en una factura».
- **Pagos y seguimiento** (ADR-0020):
  - En la ficha, un recuadro «Pagos» con total, abono requerido, pagado y saldo; la lista de pagos (fecha, medio, comprobante, quién) con «Revertir» y motivo; y «Registrar pago» con el monto sugerido (el abono que falta o el saldo, editable). Si la nota no exige pago, el abono no aparece y el saldo no se destaca; si está cancelada, no se muestra saldo por cobrar.
  - «Producir faltante» sin abono y «Despachar» con saldo se muestran deshabilitados con el motivo en texto («Falta el abono: $X») y un enlace «Producir igual (excepción)» que pide motivo.
  - Etiqueta de pago con color y texto: *Sin abono* (ámbar), *Abonado* (pizarra), *Pagado* (musgo). Las notas anteriores al control de pagos y las de la tienda dicen *No exige pago* (neutro).
  - Historial de estados en la ficha (fecha, usuario y orden de producción si la hubo) y «Atrasada N días» cuando pasó la entrega comprometida.
  - En la lista de pedidos: filtros por estado y por estado de pago, con el conteo de cada uno. En el panel: notas sin abono y atrasadas.
  - Si una nota en producción ya tiene todo reservado, se muestra el aviso «Lista para marcar»; el cambio de estado lo hace siempre una persona.
- **Ajuste:** el motivo es obligatorio; se confirma con "Este movimiento no se puede editar ni borrar".
- **Importar Excel:** se elige el archivo y se ve un informe (creadas, actualizadas y rechazadas, con fila y motivo) que se puede descargar.
- **Cierre de producción:** vista previa de los consumos por BOM y de los faltantes antes de confirmar; si un BOM es de ejemplo, aparece la etiqueta "DEMO". Si el BOM usa la madera de la puerta y una madera no tiene materia prima asociada, el cierre muestra qué falta y queda bloqueado; el panel «Madera de la puerta» permite asociarla (ADR-0012).
- **Despacho:** «Registrar despacho» abre una confirmación en línea que avisa que se descontará todo lo reservado y que el movimiento no se puede editar ni borrar. Por cada artículo de puertas se marcan las que se cargan («3 de 3 elegidas»; vienen marcadas las más antiguas, las de segunda se señalan); «Confirmar despacho» se habilita cuando cada artículo tiene sus puertas. Los accesorios salen por cantidad.
- **Recetas plegadas:** en la tabla de recetas se ve la madera de la puerta y los demás insumos quedan plegados («5 insumos»); un filtro por modelo o código acota la tabla.
- **Confirmar el cierre:** «Cerrar orden N y mover stock» abre una confirmación en línea que nombra lo que se descontará y que no se puede deshacer; tras cerrar queda el aviso «Orden N cerrada» con los códigos de las puertas nuevas (para sus etiquetas) y no se elige otra orden sola. La confirmación pregunta dónde quedan las puertas (por defecto, Fábrica). Si el cierre no es posible, el motivo se dice junto al botón como aviso, con el enlace para resolverlo («Registrar recepción de …» con la materia prima elegida, o «Asociar madera»). Solo lo que falta va en rojo.
- **Recetas (BOM):** tabla con modelo, insumos por puerta (con la lectura «1 cada N puertas»), vigencia y origen. «Editar» abre la receta vigente precargada y avisa qué líneas quedarían fuera; «Aplicar a varias recetas» fija el factor de la madera o un insumo en las recetas elegidas (todas las puertas por defecto). Las cantidades aceptan fracciones («1/70»).
- **Conteo de existencias** (Materias primas): una tabla con lo contado y el mínimo de cada materia prima; cada diferencia queda como ajuste con motivo «Conteo de existencias dd-mm-aaaa» y los mínimos se guardan juntos. El mínimo también se edita en la fila (Enter guarda, Esc cancela).
- **Puertas** (ADR-0018): el código de la etiqueta en mono y con enlace a su ficha; «de segunda» en ámbar; estado En stock (musgo), Apartada (pizarra), Despachada o Dada de baja (neutro). La ficha muestra el aviso «Apartada para …» (el nombre solo con `clientes.ver`) o «Fuera de catálogo: no se cotiza», y su historia completa, con los despachos anteriores a la app si los hay.
- **Despachos anteriores:** tabla de solo lectura; una fila con datos dudosos lo dice en ámbar («código repetido», «fecha imposible»). Sin `clientes.ver` no hay columna de cliente.
- **Clientes:** la ficha reúne los datos mínimos, sus últimas cotizaciones y notas de pedido. Sin `clientes.ver` se responde como si no existiera. Los datos personales solo se muestran ahí y nunca se envían a la IA.
- **Costos y márgenes:** columnas visibles solo con `costos.ver`.
- **PDF:** logo, datos de la fábrica, cliente, ítems, subtotal, IVA, total, vigencia y la nota "valores puestos en fábrica, flete aparte". Con las fuentes de la marca (incrustadas, ADR-0004), RUT con puntos y «Página N de M»; el archivo se llama «Neltume - Cotización N.º 9.pdf» o «Neltume - Nota de pedido N.º 1.pdf».
