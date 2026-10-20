# SPEC.md — Qué y por qué

Sin tecnologías, librerías, modelos de IA ni endpoints: eso vive en DESIGN.md, AI.md y los ADR.
Sin marcas [NEEDS CLARIFICATION] abiertas: las decisiones de la Fase 3 están en §9.

## 1. Brief

**Problema.** Neltume cotiza a mano en un Excel (lista de precios + hoja de cotización) y no tiene control formal de inventario. Cada cotización exige buscar código, medida y madera a mano; los errores de tipeo, el recargo manual por línea y la falta de stock visible generan retrabajo y promesas que la fábrica no puede cumplir.

**Usuarios.** Hoy un único perfil de usuario interno que hace todo (ventas, bodega, producción, gerencia), con permisos pensados para sumar perfiles después. Actores externos sin acceso: clientes (la tienda y clientes directos).

**Objetivos medibles** (línea base: 50–200 cotizaciones/mes, 5–15 min cada una en el Excel):

| ID | Objetivo | Meta |
|---|---|---|
| O1 | Tiempo para emitir una cotización estándar (hasta 5 ítems), del pedido a PDF aprobado | ≤ 3 min (hoy 5–15 min) |
| O2 | Cotizaciones del set de evaluación generadas sin editar ítems a mano | ≥ 70 % |
| O3 | Importes, productos o stock inventados por la IA | 0 (100 % de los importes los calcula el sistema) |
| O4 | Diferencia entre stock del sistema y conteo físico, en conteo cíclico | ≤ 2 % de los artículos contados |
| O5 | Cotizaciones con texto original, interpretación, versión de lista y aprobador guardados | 100 % |

**No-objetivos.** Facturación electrónica; portal de clientes; ventas de la tienda; envío automático de cotizaciones; entrada de pedidos por correo o mensajería; terminaciones, herrajes y puertas enchapadas; modo sin conexión; cálculo de flete (hoy "pendiente" en la cotización).

**Restricciones.** Español; moneda CLP en importes enteros; precios con y sin IVA (19 %); fechas y números en formato chileno. Bases de datos y paneles de administración nunca expuestos públicamente. Ningún secreto en documentos. Uso principal en PC con internet estable.

**Supuestos.**
- S1: una sola bodega lógica "Fábrica", con zonas de materias primas y de producto terminado; el modelo admite más bodegas después. Cada puerta lleva su ubicación (Galpón arriba, Galpón atrás, Fábrica, Tienda…) como dato propio, no como bodega (ADR-0018).
- S2: la lista de precios inicial es la hoja "Precio" del cotizador real `Cotizador Puertas Neltume.Co-rev-4E.xlsx` (fuente de verdad desde el 13-10-2026; reemplaza a la rev-4F, con los mismos códigos, categorías y hoja Cotización, pero otros precios), que también es la referencia de formato de la cotización (8.772 filas: 33 modelos × 4 maderas × 9 rangos de ancho × 7 alturas, más accesorios).
- S3: vigencia por defecto de la cotización = 10 días hábiles (tomada del Excel), configurable.
- S4: sin stock suficiente se cotiza igual, con aviso visible.
- S5: el vendedor descarga el PDF y lo envía por su cuenta.

## 2. Alcance: demo vs. producto

| Módulo | Historia | Prio | Demo |
|---|---|---|---|
| ADM | 1 Acceso y sesión · 2 Usuarios y permisos · 3 Auditoría consultable | P1 | Sí |
| STK | 1 Catálogo e importación · 2 Consulta de stock · 3 Entrada por producción · 4 Salida por despacho · 5 Ajuste con motivo · 7 Reserva | P1 | Sí |
| STK | 8 Puertas con código · 9 Inventario inicial · 10 Historial de despachos (Fase 11, ADR-0018) | P1 | No |
| STK | 6 Alertas de stock mínimo | P2 | No |
| MP | 1 Catálogo de materias primas · 2 Recepción · 3 BOM por modelo · 4 Cierre de producción | P1 | Sí |
| MP | 5 Ajuste de materias primas · 6 Alertas de reposición | P2 | No |
| COT | 1 Lista de precios versionada · 2 Cotizar en lenguaje natural · 3 Revisar ítems · 4 Aprobar y PDF · 5 Cotización manual · 6 Congelado y vigencia · 8 Nota de pedido · 9 Clientes | P1 | Sí |
| COT | 7 Descuento manual · 10 Historial y búsqueda | P2 | No (7 y 10 si hay tiempo) |
| COT | 11 Entrada de pedidos por correo o mensajería | P3 | No (fuera de alcance, §8) |

La demo no tiene fecha fija: prima la calidad. Usa clientes ficticios y la lista de precios real. Los BOM de la demo son de ejemplo (2 o 3 modelos), marcados como datos de demostración; los reales se cargan después.

## 3. Roles y actores

| Actor | Tipo | Qué puede hacer |
|---|---|---|
| Usuario interno (rol único) | Persona autenticada | Todo, incluido ver costos y márgenes. Los permisos existen por separado para poder crear otros perfiles |
| Cliente externo | Persona sin acceso | Solo recibe el PDF que el usuario le entrega |
| Asistente de IA | Actor sin permisos propios | Interpreta texto y propone ítems. No guarda, aprueba, calcula importes ni decide descuentos |
| Visitante no autenticado | Persona | Nada |

## 4. Historias y criterios de aceptación

Formato EARS. Cada historia incluye al menos un criterio de acceso denegado: en el rol único significa visitante sin sesión o usuario sin el permiso (ya sea porque se le retiró o porque existe un perfil futuro).

### 4.1 Usuarios y auditoría (REQ-ADM)

**H1 Acceso y sesión (P1).** Como usuario, quiero ingresar de forma segura para operar.
- REQ-ADM-1.1: WHEN un usuario ingresa credenciales válidas THE SYSTEM SHALL abrir una sesión y registrar el ingreso en la auditoría.
- REQ-ADM-1.2: IF las credenciales son inválidas o la sesión expiró THEN THE SYSTEM SHALL negar el acceso, no revelar cuál dato falló y registrar el intento.
- REQ-ADM-1.3: IF un visitante sin sesión pide cualquier pantalla o dato THEN THE SYSTEM SHALL negarlo.
- REQ-ADM-1.4: WHEN un usuario cambia su contraseña indicando la actual THE SYSTEM SHALL guardarla, cerrar sus otras sesiones y auditarlo sin la clave; IF la actual es incorrecta THEN SHALL contarlo como intento fallido de ingreso.

**H2 Usuarios y permisos (P1).** Como usuario, quiero administrar usuarios con permisos separados para sumar perfiles después.
- REQ-ADM-2.1: WHEN un usuario con permiso de administración crea, desactiva o cambia los permisos de otro usuario THE SYSTEM SHALL aplicar el cambio y auditarlo.
- REQ-ADM-2.2: THE SYSTEM SHALL evaluar cada acción contra un permiso explícito y no contra el nombre del rol.
- REQ-ADM-2.3: IF un usuario sin permiso de administración intenta gestionar usuarios THEN THE SYSTEM SHALL denegar la acción, no modificar datos y registrar el intento.
- REQ-ADM-2.4: IF se intenta desactivar al último usuario con permiso de administración THEN THE SYSTEM SHALL rechazarlo.
- REQ-ADM-2.5: WHEN un usuario con permiso de administración restablece la contraseña de otro THE SYSTEM SHALL guardarla, cerrar todas las sesiones de ese usuario y auditarlo sin la clave.

**H3 Auditoría consultable (P1).** Como usuario, quiero saber quién hizo qué y cuándo.
- REQ-ADM-3.1: WHEN se modifica stock, precios, cotizaciones, pedidos o usuarios THE SYSTEM SHALL registrar actor, acción, recurso, identificador, valores antes y después, resultado, fecha-hora y origen.
- REQ-ADM-3.2: WHEN un usuario con permiso de auditoría consulta el registro THE SYSTEM SHALL permitir filtrar por actor, recurso, acción y fechas.
- REQ-ADM-3.3: THE SYSTEM SHALL impedir editar o borrar registros de auditoría.
- REQ-ADM-3.4: IF un usuario sin permiso de auditoría intenta consultarla THEN THE SYSTEM SHALL denegar la acción y registrar el intento.
- REQ-ADM-3.5: IF una acción falla o es denegada THEN THE SYSTEM SHALL registrarla igualmente con su resultado. Las denegaciones sin usuario (sin sesión, login fallido o bloqueado) se registran agregadas: una por IP, acción y motivo cada 15 minutos (ADR-0016).

### 4.2 Stock de puertas (REQ-STK)

**H1 Catálogo e importación inicial (P1).** Como usuario, quiero cargar el catálogo desde el Excel actual para no digitar 8.772 filas.
- REQ-STK-1.1: WHEN un usuario con permiso de catálogo carga el Excel vigente THE SYSTEM SHALL crear modelos, maderas, medidas y artículos con su código y una versión de lista de precios, e informar cuántas filas se crearon, cambiaron y se rechazaron.
- REQ-STK-1.2: IF una fila no tiene código, medida, madera o precio válido THEN THE SYSTEM SHALL rechazarla, listar el motivo y no detener las demás filas.
- REQ-STK-1.3: WHEN se vuelve a cargar el mismo archivo THE SYSTEM SHALL no duplicar artículos ni crear una versión nueva sin cambios.
- REQ-STK-1.4: THE SYSTEM SHALL identificar cada artículo por modelo, madera, rango de ancho y alto, y conservar los accesorios (marco, piezas T, endolado, guardapolvo, pilastra) como artículos propios, identificados por escuadría o sección y largo (REQ-COT-2.13).
- REQ-STK-1.5: IF un usuario sin permiso de catálogo intenta importar o editar artículos THEN THE SYSTEM SHALL denegar la acción y registrar el intento.
- REQ-STK-1.6: IF el código de una fila no coincide con sus atributos THEN THE SYSTEM SHALL corregirla solo cuando exactamente una hipótesis sea consistente con el resto del catálogo (el código está mal, o los atributos están mal), informar la corrección y rechazar la fila si la discrepancia es ambigua.

**H2 Consulta de stock (P1).** Como usuario, quiero ver cuántas puertas hay y cuántas están comprometidas.
- REQ-STK-2.1: WHEN un usuario consulta un artículo THE SYSTEM SHALL mostrar existencia, reservado y disponible, calculados como suma de movimientos.
- REQ-STK-2.2: WHEN un usuario filtra por modelo, madera, medida o tipo THE SYSTEM SHALL listar los artículos coincidentes con su disponibilidad.
- REQ-STK-2.3: THE SYSTEM SHALL mostrar fechas y números en formato chileno.
- REQ-STK-2.4: IF un visitante o un usuario sin permiso de lectura de stock pide la consulta THEN THE SYSTEM SHALL denegarla.

**H3 Entrada por producción (P1).** Como usuario, quiero registrar las puertas terminadas.
- REQ-STK-3.1: WHEN un usuario registra una entrada con artículo, cantidad positiva y referencia de producción THE SYSTEM SHALL crear un movimiento inmutable que aumenta la existencia.
- REQ-STK-3.2: IF la cantidad no es un entero positivo o el artículo no existe THEN THE SYSTEM SHALL rechazar la entrada sin crear movimiento.
- REQ-STK-3.3: IF el mismo envío se repite por reintento THEN THE SYSTEM SHALL crear un solo movimiento.
- REQ-STK-3.4: IF un usuario sin permiso de movimientos intenta registrarla THEN THE SYSTEM SHALL denegarla y registrar el intento.

**H4 Salida por despacho (P1).** Como usuario, quiero registrar lo que sale hacia el cliente.
- REQ-STK-4.1: WHEN un usuario registra una salida con artículo, cantidad y referencia de pedido THE SYSTEM SHALL crear un movimiento inmutable que reduce la existencia y consumir la reserva asociada si existe.
- REQ-STK-4.2: IF la salida dejaría el disponible o la existencia en negativo THEN THE SYSTEM SHALL rechazarla e indicar el faltante.
- REQ-STK-4.3: IF un usuario sin permiso de movimientos intenta registrarla THEN THE SYSTEM SHALL denegarla y registrar el intento.
- REQ-STK-4.4: WHEN se registra el despacho de una nota de pedido lista THE SYSTEM SHALL liberar su reserva y descontar la existencia de cada artículo con movimientos de salida, en una sola operación, sin dejar el stock en negativo.

**H5 Ajuste con motivo (P1).** Como usuario, quiero corregir diferencias sin borrar historia.
- REQ-STK-5.1: WHEN un usuario registra un ajuste con cantidad (positiva o negativa) y motivo THE SYSTEM SHALL crear un movimiento de ajuste inmutable.
- REQ-STK-5.2: IF falta el motivo THEN THE SYSTEM SHALL rechazar el ajuste.
- REQ-STK-5.3: THE SYSTEM SHALL impedir editar o borrar un movimiento y no permitir modificar directamente el saldo.
- REQ-STK-5.4: IF un usuario sin permiso de ajuste intenta registrar uno THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H6 Alertas de stock mínimo (P2).**
- REQ-STK-6.1: WHEN el disponible de un artículo con mínimo definido queda bajo ese mínimo THE SYSTEM SHALL mostrarlo en una lista de alertas.
- REQ-STK-6.2: IF un usuario sin permiso de configuración intenta cambiar un mínimo THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H7 Reserva al confirmar el pedido (P1).** Como usuario, quiero que lo comprometido a un cliente no se venda dos veces.
- REQ-STK-7.1: WHEN una cotización pasa a nota de pedido THE SYSTEM SHALL crear un movimiento de reserva por cada ítem con stock disponible.
- REQ-STK-7.2: WHEN un pedido se cancela THE SYSTEM SHALL liberar sus reservas con un movimiento.
- REQ-STK-7.3: IF al confirmar el pedido el disponible no alcanza THEN THE SYSTEM SHALL reservar solo lo disponible, marcar el faltante en el pedido de forma visible y nunca dejar el disponible en negativo.
- REQ-STK-7.4: IF un usuario sin permiso de pedidos intenta reservar o liberar THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-STK-7.5: WHEN entra stock de un artículo con faltante en un pedido abierto (al cerrar su orden de producción o a pedido del usuario) THE SYSTEM SHALL reservarle lo disponible y actualizar el faltante.

**H8 Puertas con código (P1, ADR-0018).** Como usuario, quiero saber qué puerta es cada una, dónde está y a quién se despachó.
- REQ-STK-8.1: THE SYSTEM SHALL registrar cada puerta física con un código único (el de su etiqueta), su artículo, medida exacta, ubicación, calidad (primera o segunda) y observación; la existencia de un artículo de puertas es la cantidad de sus puertas en stock; los accesorios siguen por cantidad.
- REQ-STK-8.2: WHEN entra una puerta sin código (cierre de producción, entrada o ajuste positivo) THE SYSTEM SHALL asignarle el siguiente código de la serie de la fábrica y mostrarlo.
- REQ-STK-8.3: WHEN salen puertas (despacho de un pedido, salida o ajuste negativo) THE SYSTEM SHALL registrar cuáles: las que indique el usuario o, si no indica, las más antiguas no apartadas, primero las de primera; IF un código no existe, no está en stock o es de otro artículo THEN THE SYSTEM SHALL rechazar la operación sin crear movimientos.
- REQ-STK-8.4: WHEN un usuario con permiso de movimientos cambia la ubicación, la calidad o la observación de una puerta THE SYSTEM SHALL guardarlo y auditarlo con antes y después.
- REQ-STK-8.5: WHEN un usuario aparta una puerta para un cliente sin nota de pedido THE SYSTEM SHALL reservarla con un movimiento y no elegirla en salidas automáticas; liberarla o despacharla crea los movimientos correspondientes.
- REQ-STK-8.6: WHEN un usuario busca puertas por código, modelo, ubicación, calidad o estado THE SYSTEM SHALL listarlas y mostrar la historia de cada una (movimientos y despacho histórico).
- REQ-STK-8.7: THE SYSTEM SHALL guardar las puertas que no calzan con la lista de precios en artículos «fuera de catálogo», sin precio, que no entran al catálogo de la IA ni al cotizador; se venden con una salida que lleva el documento.
- REQ-STK-8.8: IF un usuario sin permiso de stock intenta consultar, editar, apartar o mover puertas THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H9 Inventario inicial (P1, ADR-0018).** Como usuario, quiero pasar la planilla de inventario de la fábrica a la app de una vez.
- REQ-STK-9.1: WHEN un operador carga la planilla THE SYSTEM SHALL crear cada puerta con su código, su artículo (del catálogo si modelo, madera, ancho dentro del rango y alto coinciden; si no, fuera de catálogo), ubicación normalizada, calidad, observación y fecha de producción, con un ajuste «inventario inicial» por puerta; las que tienen cliente quedan apartadas.
- REQ-STK-9.2: IF una fila no tiene código o su fecha es imposible THEN THE SYSTEM SHALL asignarle un código nuevo o dejar la fecha vacía, informarlo y seguir con las demás.
- REQ-STK-9.3: WHEN se vuelve a cargar la planilla THE SYSTEM SHALL no duplicar puertas ni filas del historial; IF ya hay puertas en stock que no vienen de la planilla THEN THE SYSTEM SHALL detenerse salvo confirmación explícita.
- REQ-STK-9.4: THE SYSTEM SHALL informar cuántas puertas cargó por destino (catálogo, fuera de catálogo, apartadas) y qué filas son dudosas, sin precios ni nombres de clientes en el informe ni en la auditoría.

**H10 Historial de despachos (P1, ADR-0018).** Como usuario, quiero saber a quién y con qué documento salió una puerta antes de usar la app.
- REQ-STK-10.1: WHEN se carga la hoja de despachos THE SYSTEM SHALL guardar cada fila (código, modelo, medida, madera, fecha de producción, estado, cliente, documento y nota) sin rechazar ninguna, marcando las dudosas (sin código numérico, código repetido o fecha imposible).
- REQ-STK-10.2: WHEN un usuario busca por código, documento o cliente THE SYSTEM SHALL listar las filas paginadas; el cliente solo se muestra y se busca con permiso de clientes.
- REQ-STK-10.3: THE SYSTEM SHALL impedir editar o borrar el historial.
- REQ-STK-10.4: IF un usuario sin permiso de stock lo consulta THEN THE SYSTEM SHALL denegarlo y registrar el intento.

### 4.3 Materias primas y producción (REQ-MP)

**H1 Catálogo de materias primas (P1).** Como usuario, quiero definir insumos y sus unidades.
- REQ-MP-1.1: WHEN un usuario crea una materia prima con nombre, unidad de medida y mínimo opcional THE SYSTEM SHALL guardarla y auditarlo.
- REQ-MP-1.2: IF el nombre ya existe o falta la unidad THEN THE SYSTEM SHALL rechazarla.
- REQ-MP-1.3: IF un usuario sin permiso de catálogo de materias primas intenta crearla o editarla THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H2 Recepción de compras (P1).** Como usuario, quiero registrar lo que llega de los proveedores.
- REQ-MP-2.1: WHEN un usuario registra una recepción con materia prima, cantidad y referencia THE SYSTEM SHALL crear un movimiento inmutable de entrada.
- REQ-MP-2.2: IF la cantidad es cero o negativa THEN THE SYSTEM SHALL rechazar la recepción.
- REQ-MP-2.3: IF el mismo envío se repite por reintento THEN THE SYSTEM SHALL crear un solo movimiento.
- REQ-MP-2.4: IF un usuario sin permiso de movimientos de materias primas intenta registrarla THEN THE SYSTEM SHALL denegarla y registrar el intento.

**H3 BOM por modelo (P1).** Como usuario, quiero definir qué insumos usa cada modelo para descontarlos solos.
- REQ-MP-3.1: WHEN un usuario define para un modelo y medida las cantidades de cada materia prima THE SYSTEM SHALL guardarlas como lista de materiales con fecha de vigencia y origen (real o de demostración).
- REQ-MP-3.2: IF una línea referencia una materia prima inexistente o una cantidad no positiva THEN THE SYSTEM SHALL rechazarla.
- REQ-MP-3.3: IF un usuario sin permiso de producción intenta editar un BOM THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-MP-3.4: WHEN un BOM incluye la madera de la puerta THE SYSTEM SHALL calcular su consumo al cerrar una orden como las pulgadas del artículo × el factor de la línea × la cantidad, y descontarlo de la materia prima asociada a la madera del artículo (ADR-0012).
- REQ-MP-3.5: WHEN un usuario con permiso de materias primas asocia una madera a una materia prima THE SYSTEM SHALL guardarlo y auditarlo; IF al cerrar una orden falta esa asociación o las pulgadas del artículo THEN THE SYSTEM SHALL rechazar el cierre indicando qué falta, sin completarlo en silencio.
- REQ-MP-3.6: WHEN un usuario con permiso de materias primas aplica un mismo cambio (factor de la madera, o agregar, cambiar o quitar un insumo por puerta) a varias recetas THE SYSTEM SHALL crear una versión nueva de cada receta general afectada en una sola transacción, auditada, e informar cuáles cambiaron, cuáles ya estaban así y cuáles no tienen receta.

**H4 Cierre de producción (P1).** Como usuario, quiero que al terminar una orden se descuenten los insumos y entren las puertas.
- REQ-MP-4.1: WHEN un usuario cierra una orden de producción con BOM definido THE SYSTEM SHALL crear los movimientos de consumo de cada materia prima y el movimiento de entrada de las puertas terminadas, todo o nada.
- REQ-MP-4.2: IF el artículo no tiene BOM THEN THE SYSTEM SHALL pedir registrar el consumo a mano antes de cerrar y no completar en silencio.
- REQ-MP-4.3: IF algún insumo no alcanza THEN THE SYSTEM SHALL impedir el cierre e indicar los faltantes.
- REQ-MP-4.4: IF una orden ya cerrada se vuelve a cerrar THEN THE SYSTEM SHALL no repetir los movimientos.
- REQ-MP-4.5: IF un usuario sin permiso de producción intenta cerrar una orden THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H5 Ajuste de materias primas (P2).**
- REQ-MP-5.1: WHEN un usuario ajusta una materia prima con motivo THE SYSTEM SHALL crear un movimiento de ajuste inmutable.
- REQ-MP-5.2: IF falta el motivo o el usuario no tiene permiso de ajuste THEN THE SYSTEM SHALL rechazar la acción y registrar el intento.

**H6 Alertas de reposición (P2).**
- REQ-MP-6.1: WHEN la existencia de una materia prima queda bajo su mínimo THE SYSTEM SHALL mostrarla en una lista de reposición.
- REQ-MP-6.2: IF un usuario sin permiso de configuración intenta cambiar un mínimo THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H7 Compras desde Chipax (P2; aprobado el 14-10-2026, ADR-0021).** Como usuario, quiero que las facturas de compra de ciertos proveedores registren solas la recepción de materias primas.
- REQ-MP-7.1: WHEN corre la sincronización (cada 30 min o con «Sincronizar ahora») THE SYSTEM SHALL leer de Chipax las facturas de compra de los proveedores habilitados, emitidas desde su habilitación y en los últimos 45 días, con su XML y respetando el límite de peticiones.
- REQ-MP-7.2: WHEN una línea de una factura (tipo 33 o 34) coincide exactamente con un mapeo del proveedor (código del ítem o, sin código, nombre normalizado) THE SYSTEM SHALL crear una recepción inmutable de la materia prima mapeada por cantidad × factor, auditada.
- REQ-MP-7.3: IF una línea no tiene mapeo THEN THE SYSTEM SHALL dejarla «por asociar», visible y sin movimientos; WHEN un usuario con permiso la asocia THE SYSTEM SHALL crear su recepción y guardar el mapeo para las facturas siguientes, o recordarla como «no es materia prima».
- REQ-MP-7.4: IF la unidad facturada difiere de la del mapeo, la cantidad no es positiva o el documento es una nota de crédito o débito THEN THE SYSTEM SHALL dejar la línea «por revisar», sin movimientos.
- REQ-MP-7.5: IF la misma factura o línea se procesa otra vez THEN THE SYSTEM SHALL no repetir la compra ni la recepción.
- REQ-MP-7.6: IF Chipax marca como rechazada o anulada una factura ya recibida THEN THE SYSTEM SHALL avisarlo en la compra sin borrar movimientos; la corrección es un ajuste con motivo.
- REQ-MP-7.7: IF Chipax no responde, limita las peticiones o el XML aún no está THEN THE SYSTEM SHALL reintentarlo en la corrida siguiente sin perder ni duplicar nada, y mostrar el estado de la última corrida.
- REQ-MP-7.8: THE SYSTEM SHALL guardar las credenciales de Chipax solo en el servicio de sincronización y no enviarlas nunca a la app, al navegador, a los logs ni a la auditoría.
- REQ-MP-7.9: IF un usuario sin permiso intenta editar proveedores o mapeos, asociar o ignorar líneas, o pedir una sincronización THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-MP-7.10: THE SYSTEM SHALL mostrar el precio de compra de cada línea solo a quien tenga `costos.ver`.

### 4.4 Cotizador (REQ-COT)

**H1 Lista de precios versionada (P1).** Como usuario, quiero mantener la lista de precios con historial.
- REQ-COT-1.1: WHEN se re-importa el Excel o se edita un precio o recargo en pantalla THE SYSTEM SHALL crear una versión nueva de la lista con fecha, autor y origen, sin alterar versiones anteriores.
- REQ-COT-1.2: THE SYSTEM SHALL calcular precio neto, IVA (19 %) y precio con IVA en pesos enteros: se redondea el precio unitario (con recargo) al peso y cada línea = cantidad × unitario entero; subtotal, IVA y total se calculan sobre esas líneas.
- REQ-COT-1.3: THE SYSTEM SHALL aplicar el recargo según el tipo de puerta; los valores de recargo y margen son configurables.
- REQ-COT-1.4: IF un usuario sin permiso de precios intenta cambiar la lista, un recargo o un margen THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-COT-1.5: IF alguien sin permiso para ver costos y márgenes consulta la lista THEN THE SYSTEM SHALL ocultarlos.

**H2 Cotizar en lenguaje natural (P1).** Como usuario, quiero pegar el pedido del cliente y obtener un borrador.
- REQ-COT-2.1: WHEN un usuario pega un pedido en texto libre THE SYSTEM SHALL proponer ítems con artículo, cantidad y medidas, enlazados a artículos reales del catálogo, y crear un borrador.
- REQ-COT-2.2: THE SYSTEM SHALL calcular precios, descuentos, totales e IVA solo desde la lista de precios vigente; el asistente de IA no aporta ningún importe.
- REQ-COT-2.3: WHEN el pedido es ambiguo (falta madera, medida o cantidad, o admite varias lecturas) THE SYSTEM SHALL dejar el ítem "por confirmar" con la duda a la vista y no elegir por el usuario.
- REQ-COT-2.4: IF el producto pedido no existe en el catálogo (por ejemplo, una madera no ofrecida) THEN THE SYSTEM SHALL dejar el ítem "por confirmar" sin precio y sin sustituirlo en silencio.
- REQ-COT-2.5: IF la medida está fuera de la grilla THEN THE SYSTEM SHALL dejar el ítem "a pedido, por confirmar", mostrar como referencia el precio del rango o altura superior, y exigir que una persona fije el precio.
- REQ-COT-2.6: WHEN hay stock insuficiente para un ítem THE SYSTEM SHALL mostrar un aviso visible con lo disponible y lo faltante, sin bloquear la cotización.
- REQ-COT-2.7: IF el servicio de IA no responde, falla o supera el tiempo límite THEN THE SYSTEM SHALL informarlo y ofrecer la cotización manual con el pedido ya pegado.
- REQ-COT-2.8: IF el texto del cliente contiene instrucciones dirigidas al sistema (por ejemplo, aplicar descuentos o ignorar reglas) THEN THE SYSTEM SHALL tratarlas como texto del pedido, no ejecutarlas y marcar el ítem o la nota para revisión.
- REQ-COT-2.9: THE SYSTEM SHALL enviar al servicio de IA solo el texto del pedido, con RUT, correo y teléfono enmascarados en cualquier formato (con o sin puntos, espacios, guion o `+56`; guiones Unicode; y toda secuencia de 7 o más dígitos), y nunca el nombre ni otros datos del cliente.
- REQ-COT-2.10: IF un visitante o un usuario sin permiso de cotizar intenta usar el cotizador THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-COT-2.11: WHEN el pedido nombra un modelo con un alias registrado («coscos» por Coz Coz) THE SYSTEM SHALL resolverlo si el alias es seguro; IF el alias es dudoso o el nombre solo se parece a un modelo THEN THE SYSTEM SHALL dejar el ítem por confirmar con la sugerencia, sin aplicarla. Un modelo real siempre gana sobre un alias.
- REQ-COT-2.12: WHEN el pedido trae medidas en metros, centímetros o milímetros THE SYSTEM SHALL interpretarlas por magnitud, dejar por confirmar las implausibles (fuera de 0,3 a 3 m) y registrar la medida solicitada, con «hoja» o «vano» solo si el cliente lo indicó.
- REQ-COT-2.13: WHEN el pedido incluye marcos, piezas T o molduras (endolado, guardapolvo, pilastra) THE SYSTEM SHALL mapearlos por madera, escuadría en pulgadas o sección en cm y largo: exacto → listo; largo entre escalones → a pedido con referencia del escalón superior; sin escuadría, sin largo o sobre el mayor → por confirmar. «Con su marco» agrega el marco con la cantidad de las puertas.
- REQ-COT-2.14: THE SYSTEM SHALL verificar que cada cantidad propuesta por la IA esté escrita en su frase del pedido (en dígitos o palabras, o heredada con «otra igual» / «con su marco») que cada medida aparezca en el texto (el largo de un accesorio, en su propia línea salvo «con su marco») y que la madera salga de la línea del ítem o de lo dicho para todo el pedido; IF no lo está, o la frase del ítem no está tal cual en el pedido (sin contar mayúsculas, tildes, puntuación ni espacios), THEN THE SYSTEM SHALL dejar el ítem por confirmar (ADR-0016); un monto («$50.000», «50 lucas») nunca respalda una cantidad ni una medida; y WHEN el pedido contiene productos que la IA no registró THE SYSTEM SHALL mostrarlos como alerta «No registré». Si el pedido expresa cantidades por destino sin nombrar producto («2 para baño y 1 para dormitorio») y la IA sigue omitiéndolas tras una corrección, THE SYSTEM SHALL conservar cada grupo como ítem de producto desconocido, `por_confirmar`, con su cantidad escrita y sin precio (ADR-0014).
- REQ-COT-2.15: THE SYSTEM SHALL exigir que el modelo, la madera y las medidas de cada ítem estén escritos en su propia línea del pedido o dichos para todo el pedido (o heredados al continuar la línea anterior), con el nombre del modelo o un alias seguro, y nunca tomados de la línea de otro ítem; IF no lo están THEN THE SYSTEM SHALL dejar el ítem por confirmar, salvo que la línea literal diga exactamente un valor de madera, cantidad, par de medidas o escuadría y la IA haya leído otro: THEN THE SYSTEM SHALL usar el de la línea y avisarlo (ADR-0013 A; nunca completa un campo vacío). WHEN la IA deja partes del pedido sin registrar THE SYSTEM SHALL pedirle una sola corrección indicándole esas partes y usarla solo si cubre más; WHEN no puede verificar un ítem contra el texto THE SYSTEM SHALL mostrarlo como alerta y dejarlo por confirmar (ADR-0016).
- REQ-COT-2.16: WHEN la IA escribe una duda sobre un ítem que el sistema verificó (completo, anclado al pedido y existente en el catálogo) THE SYSTEM SHALL mostrarla como nota del borrador sin dejar el ítem por confirmar; IF el ítem no se puede verificar THEN la duda lo deja por confirmar como siempre (ADR-0013 B). Las dudas del propio sistema (anclaje, mapeo) siempre bloquean.
- REQ-COT-2.17 (ADR-0015): WHEN el proveedor permita elegir una variante sin razonamiento para un modelo THE SYSTEM SHALL usarla en cada llamada a la IA; IF solo permite niveles de esfuerzo THEN SHALL usar el mínimo admitido. IF el proveedor no admite un control de esfuerzo comprobado para ese modelo THEN THE SYSTEM SHALL omitirlo sin impedir la activación del modelo; las demás reglas de compatibilidad siguen aplicándose.

**H3 Revisar y resolver ítems (P1).** Como usuario, quiero ver lado a lado lo que dijo el cliente y lo que se entendió.
- REQ-COT-3.1: WHEN un usuario abre un borrador THE SYSTEM SHALL mostrar el texto original junto a los ítems interpretados, con los "por confirmar" destacados.
- REQ-COT-3.2: WHEN el usuario corrige, agrega, elimina o resuelve un ítem THE SYSTEM SHALL recalcular y registrar quién lo cambió y cuándo.
- REQ-COT-3.3: IF un borrador tiene ítems "por confirmar" THEN THE SYSTEM SHALL impedir su aprobación.
- REQ-COT-3.4: IF un usuario sin permiso de cotizar intenta ver o editar un borrador THEN THE SYSTEM SHALL denegarlo y registrar el intento, sin revelar si existe.

**H4 Aprobar y generar PDF (P1).** Como usuario, quiero un PDF profesional solo cuando yo lo apruebo.
- REQ-COT-4.1: WHEN un usuario aprueba una cotización sin ítems por confirmar THE SYSTEM SHALL fijar estado aprobada, congelar precios y totales, registrar aprobador y fecha, y habilitar el PDF.
- REQ-COT-4.2: THE SYSTEM SHALL emitir el PDF con logo, datos del cliente, ítems, subtotal, IVA, total, vigencia y la nota "valores puestos en fábrica, flete aparte", en formato chileno.
- REQ-COT-4.3: IF la cotización no está aprobada THEN THE SYSTEM SHALL no generar el PDF.
- REQ-COT-4.4: THE SYSTEM SHALL no enviar ninguna cotización al cliente sin acción humana explícita.
- REQ-COT-4.5: IF un usuario sin permiso de aprobar intenta aprobar o descargar THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H5 Cotización manual (P1).** Como usuario, quiero cotizar sin IA cuando haga falta.
- REQ-COT-5.1: WHEN un usuario elige artículos y cantidades a mano THE SYSTEM SHALL calcular la cotización con las mismas reglas que la generada con IA.
- REQ-COT-5.2: IF un artículo no existe en el catálogo THEN THE SYSTEM SHALL permitir solo una línea "por confirmar" sin precio.
- REQ-COT-5.3: IF un usuario sin permiso de cotizar intenta crear una THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H6 Congelado y vigencia (P1).** Como usuario, quiero que lo cotizado no cambie si cambia la lista.
- REQ-COT-6.1: THE SYSTEM SHALL guardar en cada cotización el texto original, la interpretación de la IA, los ítems finales, la versión de lista usada y quién la aprobó o modificó y cuándo.
- REQ-COT-6.2: WHEN cambia la lista de precios THE SYSTEM SHALL mantener intactas las cotizaciones aprobadas.
- REQ-COT-6.3: WHEN se abre un borrador cuya versión de lista ya no es la vigente THE SYSTEM SHALL avisar la diferencia y ofrecer recalcular con la versión actual, sin hacerlo automáticamente.
- REQ-COT-6.4: WHEN vence la vigencia de una cotización THE SYSTEM SHALL marcarla vencida y no permitir convertirla en pedido sin recotizar.
- REQ-COT-6.5: IF un usuario sin permiso intenta modificar una cotización aprobada THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-COT-6.6: THE SYSTEM SHALL contar los días hábiles de la vigencia descontando los feriados nacionales de Chile calculados por ley para cualquier año, más los feriados adicionales (elecciones, leyes puntuales) que un usuario con permiso de configuración registre.

**H7 Descuento manual (P2).** Como usuario, quiero aplicar un descuento puntual con motivo.
- REQ-COT-7.1: WHEN un usuario aplica un descuento con motivo THE SYSTEM SHALL calcularlo en el servidor y auditar quién, cuánto y por qué.
- REQ-COT-7.2: IF falta el motivo THEN THE SYSTEM SHALL rechazar el descuento. No hay tope mientras exista un solo perfil; al sumar perfiles se definirá quién autoriza.
- REQ-COT-7.3: IF un descuento aparece en el texto del cliente o lo propone la IA THEN THE SYSTEM SHALL ignorarlo.

**H8 Nota de pedido (P1).** Como usuario, quiero convertir una cotización aceptada en pedido.
- REQ-COT-8.1: WHEN el usuario marca una cotización aprobada y vigente como aceptada THE SYSTEM SHALL crear la nota de pedido con copia de sus ítems y precios congelados, datos de despacho y transporte, y disparar la reserva de stock.
- REQ-COT-8.2: IF la cotización no está aprobada o está vencida THEN THE SYSTEM SHALL rechazar la conversión.
- REQ-COT-8.3: IF la cotización ya tiene nota de pedido THEN THE SYSTEM SHALL no crear otra.
- REQ-COT-8.4: IF un usuario sin permiso de pedidos intenta crearla THEN THE SYSTEM SHALL denegarlo y registrar el intento.
- REQ-COT-8.5: THE SYSTEM SHALL llevar la nota de pedido por pendiente → en producción (creando la orden por el faltante de catálogo) → lista (todo reservado y los ítems a pedido confirmados por una persona) → despachada, con entrega comprometida y observaciones editables hasta el despacho, cada paso auditado.
- REQ-COT-8.6: WHEN un usuario con permiso de pedidos sube el PDF de una nota de pedido de la tienda THE SYSTEM SHALL leerla sin IA (número, códigos, cantidades, medida solicitada y despacho) y mostrar una vista previa, validando cada código contra el catálogo activo, antes de crear nada (ADR-0008).
- REQ-COT-8.7: WHEN el usuario confirma la vista previa THE SYSTEM SHALL crear la nota de pedido para la tienda al precio de venta de la lista vigente sin recargo, reservar lo disponible y avisar si el precio de la nota difiere de la lista.
- REQ-COT-8.8: IF la nota ya se cargó (mismo archivo o mismo número para la misma tienda), tiene códigos inexistentes, no es un PDF legible o está anulada THEN THE SYSTEM SHALL rechazarla sin crear el pedido.
- REQ-COT-8.9: THE SYSTEM SHALL no guardar los datos personales del cliente final que aparecen en la nota de la tienda (nombre, RUT, giro, dirección, teléfono); solo la dirección de despacho, el transporte y el proyecto.

*Pagos y seguimiento (aprobado el 14-10-2026, ADR-0020):*
- REQ-COT-8.10: WHEN un usuario con permiso de pagos registra un pago (monto, fecha, medio y comprobante opcional) THE SYSTEM SHALL guardarlo como registro de solo inserción y auditarlo; pagado = suma de pagos y saldo = total con IVA − pagado. Un error se corrige con un reverso con motivo.
- REQ-COT-8.11: IF el pago supera el saldo, la nota está cancelada o el usuario no tiene permiso THEN THE SYSTEM SHALL rechazarlo (y registrar el intento si es por permiso).
- REQ-COT-8.12: THE SYSTEM SHALL mostrar el estado de pago calculado: sin abono, abonado (al menos el % de abono configurado, 50 % por defecto) o pagado; el total se puede pagar de una vez.
- REQ-COT-8.13: IF una nota sin abono pasa a producción o una con saldo se despacha THEN THE SYSTEM SHALL rechazarlo, salvo una excepción registrada en esa nota con motivo y auditada.
- REQ-COT-8.14: WHEN se cancela una nota con pagos THE SYSTEM SHALL conservarlos y anotar el monto pagado en la cancelación y la auditoría; las devoluciones no se registran en la app.
- REQ-COT-8.15: THE SYSTEM SHALL mostrar en la nota el historial de estados (fecha y usuario de cada paso, tomado de la auditoría) y marcarla atrasada cuando hoy supera la entrega comprometida y sigue abierta.
- REQ-COT-8.16: THE SYSTEM SHALL indicar en el PDF de la cotización la condición de pago y en el de la nota de pedido lo pagado y el saldo.

**H9 Clientes (P1).** Como usuario, quiero registrar clientes con datos mínimos.
- REQ-COT-9.1: WHEN un usuario crea o edita un cliente (nombre, RUT, giro, dirección, comuna, contacto, correo, teléfono) THE SYSTEM SHALL validar el RUT y guardar el cambio con auditoría.
- REQ-COT-9.2: THE SYSTEM SHALL pedir solo los datos necesarios para cotizar y despachar, y tratar los datos del cliente como personales.
- REQ-COT-9.3: IF un usuario sin permiso de clientes intenta verlos o editarlos THEN THE SYSTEM SHALL denegarlo y registrar el intento.

**H10 Historial y búsqueda (P2).**
- REQ-COT-10.1: WHEN un usuario busca por número, cliente, estado o fechas THE SYSTEM SHALL listar las cotizaciones coincidentes con paginación.
- REQ-COT-10.2: IF un usuario pide una cotización que no puede ver THEN THE SYSTEM SHALL responder como si no existiera.

## 5. Requisitos no funcionales

| ID | Requisito | Meta (propuesta) |
|---|---|---|
| REQ-NFR-1 | Tiempo del cotizador: del pedido pegado al borrador | ≤ 15 s en el 90 % de los casos |
| REQ-NFR-2 | Costo del servicio de IA por cotización | ≤ US$ 0,10 por cotización |
| REQ-NFR-3 | Disponibilidad en horario laboral (lun–vie, 08:00–19:00) | ≥ 99 % mensual |
| REQ-NFR-4 | Respaldos y restauración de datos | Respaldo diario; restauración probada, pérdida máxima 24 h |
| REQ-NFR-5 | Privacidad: mínimo necesario de datos personales; ninguno de contacto o RUT sale hacia la IA | Verificado por test |
| REQ-NFR-6 | Uso en PC con internet estable; pantallas legibles en celular, sin modo sin conexión | Sin pérdida de datos por caída breve: lo no confirmado se reintenta o se rechaza |
| REQ-NFR-7 | Toda acción que modifica datos queda auditada; toda autorización se aplica en el servidor | 100 % de los puntos de entrada |
| REQ-NFR-8 | Lista de precios completa (≈ 8.800 filas): importación y consulta fluidas | Importación ≤ 60 s; consulta ≤ 1 s |
| REQ-NFR-9 | Idioma y formato: español, CLP, fechas y números chilenos | 100 % de pantallas y PDF |

## 6. Datos de referencia

Códigos de artículo `MODELO-MADERA-ANCHO-ALTO` (por ejemplo ANC-O-4-B; fuera de catálogo, con la medida en mm: MOL-O-780X2066); código de puerta: el número de su etiqueta (202308000000210); tipos de puerta: bloque, panel y especial; maderas: Pino Oregón, Lenga, Mara y Raulí. La nota de pedido incluye cliente, RUT, giro, dirección, dirección de despacho, comuna, medio de transporte y contacto.

## 7. Trazabilidad de decisiones (entrevista Fase 0)

Rol único con permisos separados → REQ-ADM-2.x · BOM por modelo → REQ-MP-3.x, 4.x · reserva al confirmar pedido → REQ-STK-7.x, REQ-COT-8.x · solo canal interno y aprobación humana → REQ-COT-4.x · medida fuera de grilla → REQ-COT-2.5 · lista única + recargo por tipo → REQ-COT-1.3 · descuento manual → REQ-COT-7.x.

## 8. Fuera de alcance

Facturación electrónica · portal de clientes · ventas de la tienda · envío automático · entrada por correo o mensajería (P3, no planificada) · terminaciones, herrajes y enchapadas · flete · modo sin conexión · múltiples bodegas y traspasos (modelo preparado, sin pantallas).

## 9. Decisiones de clarificación (Fase 3)

| ID | Decisión |
|---|---|
| NC-1 | Línea base: 50–200 cotizaciones/mes, 5–15 min cada una. El número de usuarios no condiciona el diseño |
| NC-2 | Demo sin fecha fija |
| NC-3 | BOM de demo: de ejemplo, 2 o 3 modelos, marcados; los reales se cargan después |
| NC-4 | Pedido sin stock suficiente: se reserva lo disponible y el faltante queda marcado (REQ-STK-7.3) |
| NC-5 | Redondeo al peso del precio unitario; línea = cantidad × unitario (REQ-COT-1.2) |
| NC-6 | Descuento sin tope, con motivo obligatorio y auditado (REQ-COT-7.2) |
| NC-7 | Borrador en ≤ 15 s (p90); costo de IA ≤ US$ 0,10 por cotización (REQ-NFR-1, 2) |
| NC-8 | Precios: re-importar el Excel y editar en pantalla, ambos versionados; referencia `Cotizador Puertas Neltume.Co-rev-4E.xlsx` (REQ-COT-1.1) |
| NC-9 | Flete fuera de alcance; el PDF dice "flete aparte" (REQ-COT-4.2) |
| NC-10 | Cotizador real como fuente de verdad (rev-4F el 06-10-2026; rev-4E desde el 13-10-2026, misma hoja Cotización): su calculadora de flete (1.500 × km) **no** se incorpora y el flete sigue fuera de alcance; su % por línea con signo se cubre con el recargo por tipo y el descuento global con motivo; se mantienen la vigencia de 10 días hábiles y la nota "valores puestos en fábrica" aunque el cotizador real ya no las imprima |
| NC-11 | Sin entrada por correo ni mensajería: la empresa no usa Google Workspace (ADR-0007 rechazado; sigue ADR-0003) |
| NC-12 | A la tienda se le vende al precio de venta de la lista vigente, sin recargo: su cotizador le suma su propio porcentaje (Fase 5) |
| NC-13 | Feriados legales calculados por ley (portado del cotizador de la tienda), sin sincronizar con fuentes externas; los únicos se cargan a mano (REQ-COT-6.6) |
| NC-14 | Pago (aprobado el 14-10-2026, ADR-0020): abono mínimo del 50 % (configurable) para producir y saldo antes de despachar o retirar; se puede pagar el total de una vez; si se cancela con abono, solo se anota. Si la tienda también abona está por confirmar (REQ-COT-8.10–8.14) |
| NC-15 | Compras desde Chipax (aprobado el 14-10-2026, ADR-0021): las facturas de compra de proveedores habilitados suben el stock de materias primas; solo líneas con mapeo exacto, lo demás «por asociar» o «por revisar»; sin histórico previo a la habilitación. Qué proveedores, por definir; el desfase entre factura y llegada se acepta (REQ-MP-7.x) |
| — | Nombre del cliente: nunca se envía a la IA (REQ-COT-2.9) |

## 10. Ajustes de IA (ADR-0009, 06-10-2026)

- **REQ-ADM-4.1:** Command Code y Groq usan claves independientes (`CMD_API_KEY`, `GROQ_API_KEY`) configuradas solo en el entorno privado del worker. Ajustes configura proveedor/modelo y ZDR; API, UI, logs y auditoría no reciben ni exponen las claves.
- **REQ-ADM-4.2:** Ajustes lista modelos de Command Code y tarifas públicas por millón; modelos sin chat/herramienta o sin precio quedan deshabilitados con motivo. La configuración activa se aplica al iniciar el próximo trabajo.
- **REQ-ADM-4.3:** Ajustes lista modelos autenticados de Groq, capacidades Free públicas (RPM, RPD, TPM, TPD) y fecha. Son referencias; la cuota real se consulta en Groq Console. Preview e incompatibles se deshabilitan. Activar Groq exige confirmar ZDR en Console.
- La evaluación de AI.md es informativa y no bloquea cambiar proveedor o modelo; no habilita aprobación automática de cotizaciones.
