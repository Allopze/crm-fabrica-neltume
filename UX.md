# UX.md — Pantallas y estados

Uso principal en PC (≥ 1280 px); las pantallas deben poder leerse en celular, sin flujos propios (REQ-NFR-6). Español, CLP con separador de miles ($1.234.567) y fechas dd-mm-aaaa.

## 1. Mapa de pantallas

| Sección | Pantalla | Permiso | Refs |
|---|---|---|---|
| Acceso | Login | público | REQ-ADM-1 |
| Inicio | Panel: cotizaciones en borrador, alertas de stock y de MP, pedidos con faltante | sesión | — |
| Cotizador | **Nueva cotización** (pegar texto) → **Revisión** (lado a lado) → Aprobada (PDF) | `cotizaciones.*` | REQ-COT-2, 3, 4 |
| Cotizador | Cotización manual | `cotizaciones.crear` | REQ-COT-5 |
| Cotizador | Lista y búsqueda de cotizaciones | `cotizaciones.crear` | REQ-COT-10 |
| Pedidos | Lista · Detalle (reservado, faltante; avance: producir faltante, completar reserva, marcar lista, despachar; despacho y entrega comprometida) · Crear desde cotización · Desde nota de la tienda (subir PDF → vista previa → confirmar) | `pedidos.gestionar` | REQ-COT-8, REQ-STK-4.4, 7 |
| Stock | Consulta con filtros (modelo, madera, medida, tipo) · Detalle de artículo con movimientos | `stock.ver` | REQ-STK-2 |
| Stock | Registrar entrada / salida / ajuste | `stock.mover`, `stock.ajustar` | REQ-STK-3..5 |
| Materias primas | Lista · Recepción · BOM por modelo · Órdenes de producción (cerrar) | `mp.*`, `produccion.gestionar` | REQ-MP |
| Precios | Versiones de la lista · Editar (nueva versión) · Importar Excel con informe | `precios.editar`, `catalogo.editar` | REQ-COT-1, REQ-STK-1 |
| Clientes | Lista · Ficha | `clientes.*` | REQ-COT-9 |
| Administración | Usuarios · Roles y permisos · Auditoría · Métricas IA · Feriados · Ajustes de IA (proveedor, modelo y ZDR; claves en entorno privado del worker) | `usuarios.gestionar`, `auditoria.ver`, `config.editar` | REQ-ADM |

Navegación lateral fija; la opción de cotizar está siempre visible arriba.

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

- Al pasar sobre un ítem se resalta su `texto_fuente` en el texto original.
- Si la cantidad del ítem no coincide con la cifra del fragmento original, se resalta para que el revisor la confirme.
- Todo texto que venga de la IA (dudas, alertas, fragmentos) se muestra como texto escapado, nunca como HTML.
- `❓ por confirmar` y `✏ a pedido` usan color y texto (no solo color) y no se pueden aprobar hasta resolverlos (REQ-COT-3.3). El botón Aprobar indica cuántos quedan.
- El aviso de stock es informativo y nunca bloquea (REQ-COT-2.6).
- Si la lista de la cotización no es la vigente, aparece un banner con "Recalcular" (REQ-COT-6.3).
- Si la IA falló, el panel derecho muestra "No pudimos interpretar el pedido" y [Cotizar a mano], con el texto conservado (REQ-COT-2.7).
- Al aprobar se muestra un resumen de confirmación; luego la vista queda en solo lectura con [Descargar PDF] y [Convertir en pedido].
- Mientras interpreta, el panel derecho dice "Interpretando… (hasta 15 s)". Si pasa de 30 s se ofrece la cotización manual.

## 4. Otros detalles

- **Consulta de stock:** una tabla con existencia, reservado y disponible; mínimo en rojo con texto "bajo mínimo".
- **Ajuste:** el motivo es obligatorio; se confirma con "Este movimiento no se puede editar ni borrar".
- **Importar Excel:** se elige el archivo y se ve un informe (creadas, actualizadas y rechazadas, con fila y motivo) que se puede descargar.
- **Cierre de producción:** vista previa de los consumos por BOM y de los faltantes antes de confirmar; si un BOM es de ejemplo, aparece la etiqueta "DEMO". Si el BOM usa la madera de la puerta y una madera no tiene materia prima asociada, el cierre muestra qué falta y queda bloqueado; el panel «Madera de la puerta» permite asociarla (ADR-0012).
- **Confirmar el cierre:** «Cerrar orden N y mover stock» abre una confirmación en línea que nombra lo que se descontará y que no se puede deshacer; tras cerrar queda el aviso «Orden N cerrada» y no se elige otra orden sola. Si el cierre no es posible, el motivo se dice junto al botón.
- **Recetas (BOM):** tabla con modelo, insumos por puerta (con la lectura «1 cada N puertas»), vigencia y origen. «Editar» abre la receta vigente precargada y avisa qué líneas quedarían fuera; «Aplicar a varias recetas» fija el factor de la madera o un insumo en las recetas elegidas (todas las puertas por defecto). Las cantidades aceptan fracciones («1/70»).
- **Conteo de existencias** (Materias primas): una tabla con lo contado y el mínimo de cada materia prima; cada diferencia queda como ajuste con motivo «Conteo de existencias dd-mm-aaaa» y los mínimos se guardan juntos. El mínimo también se edita en la fila (Enter guarda, Esc cancela).
- **Costos y márgenes:** columnas visibles solo con `costos.ver`.
- **PDF:** logo, datos de la fábrica, cliente, ítems, subtotal, IVA, total, vigencia y la nota "valores puestos en fábrica, flete aparte".
