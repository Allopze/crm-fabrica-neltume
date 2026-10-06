# Plan del sistema — Fábrica Puertas Neltume

## 1. Objetivo

Webapp interna de la **fábrica** (no de la tienda) para:

1. Controlar el **inventario** de materias primas y puertas terminadas.
2. Registrar la **producción** (consumo de materiales → puertas terminadas).
3. **Cotizar** con un asistente de IA en lenguaje natural, con precios calculados de forma determinística.
4. Convertir cotizaciones aceptadas en **notas de pedido**.

Márgenes, recargos y reglas de precio quedan **configurables** y se definen después de implementar.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| App | Next.js (App Router) + TypeScript | Front y back en un solo proyecto |
| UI | Tailwind + shadcn/ui | Componentes listos para tablas y formularios |
| Base de datos | PostgreSQL vía Drizzle ORM | Esquema tipado y migraciones |
| BD en desarrollo | PGlite (Postgres embebido) | No requiere instalar Docker ni Postgres |
| BD en producción | Supabase o Neon | Postgres administrado (se decide al desplegar) |
| Validación | Zod | Formularios y salidas de la IA |
| IA | API de Claude con tool use | El modelo llama herramientas, no calcula precios |
| PDF | react-pdf | Cotizaciones y notas de pedido |
| Auth | Auth.js (credenciales) | Usuarios internos con roles |

## 3. Arquitectura

Monolito Next.js con la lógica de negocio separada de la UI:

```
src/
  app/                 # páginas y rutas API
    (app)/inventario/
    (app)/catalogo/
    (app)/produccion/
    (app)/cotizaciones/
    (app)/pedidos/
    (app)/clientes/
    api/cotizador/     # endpoint del chat IA
  db/
    schema.ts          # tablas Drizzle
    migrations/
  domain/              # lógica pura, testeable, sin UI
    inventario.ts      # movimientos y saldo
    produccion.ts      # consumo según BOM
    precios.ts         # motor de precios
    cotizaciones.ts    # estados y conversión a pedido
  ai/
    tools.ts           # herramientas que puede usar el modelo
    cotizador.ts       # bucle de conversación
  lib/
scripts/
  importar-excel.ts    # carga inicial desde datos/COTIZADOR_2026.xlsx
```

Regla principal: **todo cambio de stock pasa por `domain/inventario.ts`** y queda como movimiento; el saldo se deriva de los movimientos.

## 4. Modelo de datos

### Catálogo
- **modelo**: id, nombre (ANCACOMOE), código (ANC), activo.
- **madera**: id, nombre, código (O/L/M/R).
- **rango_ancho**: código (1–9), etiqueta ("0,80 A 0,85"), min, max.
- **rango_alto**: código (A–G), alto en metros.
- **articulo**: id, código (`ANC-O-3-A` o código interno), nombre, clase (`puerta` | `accesorio` | `materia_prima`), tipo (bloque/panel/especial/…), modelo_id, madera_id, ancho_id, alto_id, unidad, stock_minimo, activo.
- **bom_linea**: articulo_id (puerta), materia_prima_id, cantidad. Opcional por artículo.

### Precios (configurables)
- **costo_articulo**: articulo_id, producción, materiales, insumos, generales, vigente_desde.
- **regla_precio**: alcance (global / tipo / madera / artículo), margen, recargo, vigente_desde.
- El motor (`domain/precios.ts`) resuelve: costo → precio fábrica → recargo → precio final. En la carga inicial se usan los precios importados del Excel.

### Inventario
- **bodega**: id, nombre (por defecto "Fábrica").
- **movimiento**: id, fecha, articulo_id, bodega_id, cantidad (+/−), tipo (`entrada` | `salida` | `ajuste` | `consumo_produccion` | `produccion` | `reserva` | `liberacion`), referencia (orden/pedido), usuario_id, nota.
- Vista **stock_actual**: suma de movimientos por artículo y bodega (disponible y reservado).

### Producción
- **orden_produccion**: id, número, estado (`planificada` | `en_proceso` | `terminada` | `anulada`), nota_pedido_id (opcional), fechas.
- **orden_produccion_linea**: articulo_id, cantidad.
- Al terminar una orden: un movimiento `consumo_produccion` por material del BOM y un movimiento `produccion` por puerta.

### Comercial
- **cliente**: id, tipo (`tienda` | `directo`), nombre, RUT, giro, dirección, dirección de despacho, comuna, contacto, teléfono, email.
- **cotizacion**: id, número, cliente_id, proyecto, estado (`borrador` | `enviada` | `aceptada` | `rechazada` | `vencida`), origen (`manual` | `ia`), texto_original, subtotal, iva, total, validez, usuario_id.
- **cotizacion_linea**: articulo_id, descripción, cantidad, precio_fabrica, recargo, precio_unitario, total. Precios **congelados** al cotizar.
- **nota_pedido**: id, número, cotizacion_id, cliente_id, despacho, medio de transporte, estado (`pendiente` | `en_produccion` | `lista` | `despachada`).
- **nota_pedido_linea**: copia de las líneas de la cotización.

### Sistema
- **usuario**: id, nombre, email, rol (`admin` | `ventas` | `produccion`).
- **conversacion_ia**: cotizacion_id, mensajes (JSON), para auditoría.

## 5. Módulos y pantallas

| Módulo | Pantallas |
|---|---|
| Inventario | Stock actual con filtros por clase/modelo/madera, alertas de mínimo, registrar entrada/salida/ajuste, historial de movimientos |
| Catálogo | Modelos, maderas, medidas, artículos, BOM por artículo |
| Producción | Lista de órdenes, crear orden (manual o desde pedido), cerrar orden |
| Cotizaciones | Lista, cotizador manual (formulario tipo Excel), cotizador IA (chat + vista previa), PDF |
| Pedidos | Lista de notas de pedido, detalle, estado, PDF, crear orden de producción |
| Clientes | Lista y ficha con historial |
| Configuración | Usuarios, reglas de precio (después) |

## 6. Cotizador IA

1. El usuario escribe el pedido en texto libre.
2. Claude interpreta y usa herramientas:
   - `buscar_articulos(modelo, madera, ancho, alto)` → códigos válidos del catálogo.
   - `consultar_stock(codigos)` → disponible.
   - `calcular_cotizacion(lineas, cliente)` → precios desde `domain/precios.ts`.
   - `buscar_cliente(texto)`.
3. Si falta un dato (madera, medida, cantidad), el modelo pregunta.
4. El resultado es un **borrador** de cotización que el usuario revisa y edita antes de enviar.

El modelo nunca escribe precios: solo devuelve códigos y cantidades validados con Zod.

## 7. Fases

| Fase | Entregable |
|---|---|
| **1. Base** | Proyecto Next.js, esquema y migraciones, PGlite, layout con navegación, auth con roles |
| **2. Catálogo + importación** | Script que importa modelos, maderas, medidas, artículos y precios desde el Excel; pantallas de catálogo |
| **3. Inventario** | Movimientos, stock actual, alertas, materias primas |
| **4. Cotizaciones y pedidos** | Clientes, cotizador manual, estados, conversión a nota de pedido, PDFs |
| **5. Producción** | Órdenes, BOM, consumo automático de materiales |
| **6. Cotizador IA** | Chat, herramientas, borrador, set de pruebas con pedidos reales |
| **7. Precios y despliegue** | Configurar márgenes/recargos, deploy a producción |

## 8. Pendientes para después

- Márgenes y recargos por tipo de puerta y cliente.
- BOM real por modelo (levantar con producción).
- Hosting de producción.
