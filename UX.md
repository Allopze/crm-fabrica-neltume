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
| Materias primas | Lista con búsqueda y filtro «bajo el mínimo» · Recepción (también desde «Recibir» en la fila) · Ajuste · Conteo | `mp.*`, `stock.ajustar` | REQ-MP |
| Producción | Pestañas: Órdenes (crear y cerrar) · Recetas (BOM) · Madera de la puerta | `produccion.gestionar`, `mp.editar` | REQ-MP |
| Precios | Precios vigentes con filtros (código o modelo, madera, tipo, alto) · Versiones · Recargos · Editar (nueva versión) · Importar Excel con informe | `precios.editar`, `catalogo.editar` | REQ-COT-1, REQ-STK-1 |
| Clientes | Lista · Ficha (datos, cotizaciones y notas) | `clientes.*` | REQ-COT-9 |
| Administración | Usuarios · Roles y permisos · Auditoría · Métricas IA · Feriados · Ajustes de IA (proveedor, modelo y privacidad de datos; claves en el entorno privado del servidor) | `usuarios.gestionar`, `auditoria.ver`, `config.editar` | REQ-ADM |

Navegación lateral fija desde 1024 px; en pantallas más angostas se abre como cajón con el botón de menú (Esc lo cierra). Para quien puede cotizar, la entrada «desde texto» está siempre visible arriba; las listas solo agregan «Cotizar a mano». En celular las tablas ocultan las columnas secundarias y conservan número, cliente o artículo, estado y total o disponible. Sin buscador global: cada lista tiene su propio filtro. Las tablas anchas se desplazan dentro de su marco (también con teclado) y la página nunca se desplaza hacia el costado; en pantallas táctiles los controles miden al menos 44 px.

## 2. Estados comunes (toda pantalla)

| Estado | Comportamiento |
|---|---|
| Vacío | Mensaje y acción principal ("Aún no hay cotizaciones. Pega un pedido para empezar.") |
| Carga | Esqueletos en tablas; botones en espera con texto ("Interpretando pedido…"); nunca un spinner sin texto |
| Error | Mensaje en español con la acción sugerida y el código de error para soporte; los datos ingresados se conservan |
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
- El botón Aprobar y su motivo quedan fijos al pie de la pantalla mientras se revisan los ítems. Una cotización manual (sin texto del cliente) se muestra en una sola columna.
- Si la lista de la cotización no es la vigente, aparece un banner con "Recalcular" (REQ-COT-6.3).
- Si la IA falló, el panel derecho muestra "No pudimos interpretar el pedido" y [Cotizar a mano], con el texto conservado (REQ-COT-2.7).
- Al aprobar se muestra un resumen de confirmación en línea (ítems, cliente, total, lista congelada y la vigencia configurada en días hábiles) con [Confirmar aprobación] y [Volver a revisar]; luego la vista queda en solo lectura (cantidades y cliente como texto) con «Aprobada por … el dd-mm-aaaa hh:mm», [Descargar PDF] y [Convertir en pedido]; si ya tiene nota de pedido, enlaza a ella. Una aceptada cuyo pedido se canceló dice «Aceptada · pedido cancelado».
- En «Nueva cotización», Ctrl + Enter (⌘ + Enter) envía el texto a interpretar.
- Mientras interpreta, el panel derecho dice "Interpretando… (hasta 15 s)". Si pasa de 30 s deja de consultar y ofrece [Volver a consultar], [Copiar texto] y [Cotizar a mano]. Si el envío falla antes de crear la cotización, el texto queda en el cuadro y se ofrece copiarlo.

## 4. Otros detalles

- **Consulta de stock:** una tabla con existencia, reservado y disponible; bajo el mínimo en ámbar con texto "bajo mín."; sin mínimo definido, la columna de nivel dice "sin mínimo" en vez de dibujar la barra. En el detalle, cada movimiento nombra su referencia («Nota de pedido N.º 1», «Orden N.º 3», con enlace) y la reserva o liberación se lee aparte («2 reservadas»), sin signo de entrada o salida.
- **Auditoría:** acciones, recursos y resultados en español; el detalle muestra pares campo–valor (antes y después) con montos, cifras y fechas en formato chileno, sin ids internos; los códigos de error se leen en palabras. Las filas de una misma operación (misma transacción) se agrupan bajo la primera.
- **Selector de archivo:** botón y texto en español («Elegir PDF», «Ningún archivo elegido»), no el control nativo del navegador.
- **Nota de pedido:** «Cancelar pedido» va al pie del panel de avance, lejos del PDF. Despachada, cada ítem dice cuántas se despacharon (sin «reservadas»).
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
- **PDF:** logo, datos de la fábrica, cliente, ítems, subtotal, IVA, total, vigencia y la nota "valores puestos en fábrica, flete aparte".
