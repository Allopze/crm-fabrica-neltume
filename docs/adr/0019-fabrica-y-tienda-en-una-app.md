# ADR-0019 — Fábrica y tienda en una sola app

**Estado:** propuesto (pendiente de aprobación del usuario) · **Fecha:** 08-10-2026 · **Refs:** ADR-0002, ADR-0005, ADR-0008, ADR-0017, ADR-0018, NC-12, REQ-COT-8.5–8.9, AGENTS reglas 5, 6, 7, 8, 9 y 11 · **Reemplazaría:** ADR-0008, después del corte.

## Contexto

La tienda (Neltume.co) cotiza en su propia app (`referencia/`: Next.js 16, SQLite sin ORM, Better Auth, todos los usuarios admin) y la fábrica cotiza en esta. Hoy solo se conectan por la nota de pedido en PDF (ADR-0008). El usuario quiere que ambas coticen en el mismo sitio, cada una con su inventario y sus datos.

El usuario confirmó lo siguiente el 08-10-2026:
- Fábrica y tienda son **empresas distintas, con RUT distintos**.
- La tienda **le compra las puertas** a la fábrica.
- El **historial de la tienda se conserva**.

Hechos que pesan en la decisión:
- **Mismo catálogo y precio base.** Las dos venden el mismo catálogo de puertas sólidas con los mismos códigos. El precio base de la tienda es la lista de la fábrica sin recargo (NC-12), pero hoy cada app importa el Excel por su cuenta.
- **Lo propio de la tienda:**
  - productos de otro proveedor (enchapadas, prepintadas, marcos finger);
  - margen por categoría y descuento por tramos;
  - flete con tarifa Starken;
  - pagos con anticipo;
  - estados comerciales y operativos que se marcan a mano.
- **Todo está duplicado.** Las dos apps mantienen por separado login, IA, feriados, PDF, despliegue y respaldos. Las fases 5 y 7 ya portaron aquí la IA de la tienda.

## Decisión

1. **Una sola app y una sola base: esta.** Los repos no se fusionan. `referencia/` sigue siendo la fuente desde donde se porta y se retira después del corte.
2. **Unidad de negocio = empresa.** Una tabla `unidad` guarda `fabrica` y `tienda`, cada una con razón social, RUT, giro, dirección y la marca para el PDF. Llevan `unidad_id` los correlativos, los parámetros (vigencia, anticipo…), los clientes, las cotizaciones, las notas de pedido, las bodegas y `audit_log`.
3. **Permisos por permiso y por unidad.**
   - `usuario_unidad (usuario_id, unidad_id, rol_id)` reemplaza `usuario.rol_id`.
   - El guard pasa a `conPermiso(permiso, unidad)` y usa la unidad activa de la sesión, verificada contra la membresía del usuario. Sin membresía responde 404, igual que cuando falta permiso de lectura.
   - Quien pertenece a las dos unidades las cambia con un selector.
   - La segunda barrera es RLS de Postgres sobre las tablas con `unidad_id`: la transacción declara su unidad, siguiendo la línea de ADR-0017. Una operación entre unidades, como la compra a la fábrica, declara las dos.
4. **Qué ve cada unidad.**
   - **Compartido:** el catálogo de puertas sólidas y accesorios, la lista de precios de la fábrica (versionada; solo la fábrica la edita), los feriados y la configuración de la IA.
   - **La tienda** ve el *disponible* de la fábrica por artículo y el estado de sus compras. Nunca ve costos, BOM, márgenes ni clientes de la fábrica.
   - **La fábrica** ve a la tienda como un cliente más (`cliente.tipo = tienda`, con su RUT) y ve sus pedidos. Nunca ve los clientes finales ni los márgenes de la tienda; REQ-COT-8.9 se mantiene.
5. **Catálogo propio de la tienda.** Las enchapadas, prepintadas y marcos finger son artículos de la unidad tienda, con proveedor y su propia lista de costo versionada. La fábrica no los ve ni los cotiza, y la regla 11 sigue rigiendo para ella.
6. **Precios en capas.**
   - **Fábrica:** sin cambios. Lista más recargo por tipo; a la tienda le vende a lista sin recargo (NC-12).
   - **Tienda:** el cálculo sigue este orden:
     1. Base: la lista vigente de la fábrica, o la del proveedor para sus productos propios.
     2. Margen versionado por categoría, con excepción por cotización o por línea.
     3. Descuento por tramos de cantidad, con tope.
     4. Descuento manual, con motivo.
     5. Flete, como una línea más.
     6. IVA.

     Fijar a mano un precio unitario es una excepción con motivo y queda auditada.
   - La cotización congela las dos versiones: la lista base y la política de la tienda.
   - La IA sigue sin decidir precios, márgenes ni descuentos (reglas 1 y 9).
7. **La compra a la fábrica es un pedido interno, sin PDF.** La tienda genera su nota de pedido cuando la cotización está aprobada y el anticipo cumple su regla. Al hacerlo:
   - lo que ya está en la bodega de la tienda se reserva ahí;
   - lo que falta crea un pedido en la fábrica (cliente = tienda, origen `tienda`, ligado a la nota de la tienda). Ese pedido sigue el ciclo de REQ-COT-8.5 y la tienda ve su estado sin marcarlo a mano;
   - lo que viene del otro proveedor queda como compra externa pendiente, sin integración.
8. **Inventario por bodega y por dueño.**
   - Hay dos bodegas: `Fábrica` (unidad fábrica) y `Tienda` (unidad tienda).
   - Despachar un pedido de la tienda registra, en la misma transacción, la salida de Fábrica y la entrada a Tienda de la **misma puerta**: mismo código (ADR-0018). La puerta cambia de dueño y conserva su historia.
   - Lo que llega del otro proveedor entra como recepción en Tienda.
   - La regla 5 (movimientos inmutables) rige en ambas bodegas.
9. **Una sola IA** (`src/ai`). El catálogo resumido se arma según la unidad, y el de la tienda incluye su catálogo propio. La forma de cotizar en la tienda (chat, o texto más revisión) se decide en UX; no habrá un segundo motor.
10. **Migración del historial de la tienda.** Es una sola vez, por consola, idempotente y con `--simular`.
    - Cotizaciones, líneas congeladas, montos, notas de pedido, pagos, eventos y comentarios pasan como documentos **de solo lectura**, marcados `importado` y con sus importes tal cual, sin recalcular.
    - Los clientes hoy viven dentro de cada cotización. Se extraen a `cliente` de la unidad tienda y se deduplican por RUT válido; los que no tienen RUT quedan como clientes separados.
    - Los correlativos siguen desde el último número usado y nunca se reutilizan.
    - Los usuarios se crean con argon2id y contraseña nueva, porque las claves de Better Auth no se portan.
    - Las notas que la fábrica ya cargó por PDF se ligan por `ref_externa`.
    - El informe y `audit_log` guardan solo conteos, sin datos de clientes ni importes.
11. **Corte.**
    1. Ensayo sobre una copia.
    2. Congelar la app de la tienda.
    3. Migrar.
    4. Verificar conteos y totales por estado.
    5. Si falla, volver a la app anterior.

    Después del corte, la app anterior queda solo de consulta por un tiempo y luego se retira.

## Cambios en reglas y documentos (al aprobar)

- **AGENTS.md:**
  - El proyecto pasa a ser «fábrica y tienda, dos RUT».
  - Regla 6: permisos por permiso **y por unidad**.
  - Regla 7: la auditoría registra la unidad.
  - Regla 9: el precio sigue la política de cada unidad.
  - Regla 11: las enchapadas son solo de la tienda.
  - Prefijo nuevo REQ-TDA.
- **SPEC.md:**
  - Brief y actores: se suma el personal de la tienda.
  - No-objetivos y §8: salen las ventas, las enchapadas y el flete de la tienda, y las múltiples bodegas.
  - S1 pasa a dos bodegas, y se agregan decisiones NC nuevas.
  - Historias nuevas: REQ-ADM-5 (unidades) y REQ-TDA (precios, pagos, flete, compra a la fábrica y migración).
  - REQ-COT-8.6–8.9 quedan solo para la transición.
- **Resto de los documentos:**
  - DATA-MODEL.
  - SECURITY: matriz por unidad, RLS y Starken como conexión saliente nueva.
  - DESIGN.
  - AI: catálogo por unidad y casos de la tienda.
  - API: unidad activa.
  - UX: selector y pantallas de la tienda.
  - TESTING: aislamiento entre unidades.
  - TASKS: fases 12–16.
- **ADR:** ADR-0008 pasa a «reemplazado» después del corte. ADR-0018 se complementa, porque «Tienda» deja de ser una ubicación dentro de la fábrica.

## Fases propuestas

Empiezan después de la Fase 2 en producción (T2.5 y T2.11), para no hacer dos migraciones a la vez.

- **12 Base multiunidad:**
  - tablas `unidad` y `usuario_unidad`, unidad activa y selector;
  - `conPermiso(permiso, unidad)` y RLS;
  - `unidad_id` en las tablas existentes (todo queda en `fabrica`) y auditoría con unidad;
  - tests de aislamiento en cada endpoint.

  Para la fábrica no cambia nada visible.
- **13 La tienda cotiza:**
  - catálogo propio y su lista;
  - política de precios versionada con tramos y excepciones con motivo;
  - IA con el catálogo de la tienda;
  - PDF con su RUT y su marca;
  - correlativos, vigencia y clientes propios.
- **14 Compra a la fábrica e inventario:**
  - nota de pedido de la tienda y pedido interno;
  - reserva en la bodega Tienda;
  - despacho con cambio de dueño;
  - recepciones del otro proveedor y stock de la tienda.
- **15 Lo comercial de la tienda:**
  - pagos y anticipo;
  - estados comerciales y seguimiento;
  - revisiones (reemplazada) y anulación;
  - flete con tarifa Starken;
  - comentarios internos, historial y búsqueda.
- **16 Migración del historial y corte** (decisiones 10 y 11), con un período en paralelo y el retiro de `referencia/`.

## Pendientes

No bloquean. Entre paréntesis, el valor por defecto.

- **Puertas con ubicación «Tienda» en `INVENTARIO.xlsx`:** ¿ya son de la tienda o son de la fábrica en exhibición? (La tienda hace un conteo inicial al corte; lo que cuente entra como compra inicial a la fábrica, auditada.)
- **Forma de cotizar en la tienda:** chat, o texto más revisión. (Texto más revisión, igual que en la fábrica; el chat se evalúa después.)
- **Quién tiene acceso a las dos unidades.** (El administrador actual.)
- **Regla del anticipo para generar la nota.** (La de la app de la tienda, como parámetro de la unidad.)

## Consecuencias

- \+ Un solo catálogo y una sola lista: un cambio de precios de la fábrica le llega solo a la tienda.
- \+ La compra de la tienda deja de pasar por PDF: no hay que transcribir nada ni marcar estados a mano.
- \+ Una sola base de código, un despliegue, un respaldo y una evaluación de IA.
- − Una caída o un mal despliegue afecta a las dos empresas a la vez.
- − Una falla de aislamiento expondría los datos de la otra empresa. Por eso hay guard, RLS y tests de aislamiento por endpoint desde la Fase 12.
- − Migrar el historial y cortar una app en uso es lo más riesgoso: exige ensayo y vuelta atrás.
- − Hay más reglas de precio (dos políticas) y más superficie expuesta (Starken, pagos).

## Alternativas

- **Dos apps conectadas por API:** dos bases de código, un contrato y la red entre ellas, con el catálogo y los precios sincronizados aparte. Descartado.
- **Dos apps sobre la misma base:** suma el acoplamiento sin ninguno de los beneficios. Descartado.
- **Una base por empresa (multi-tenant aislado):** la compra a la fábrica cruza las dos empresas y el catálogo es común. Obligaría a usar transacciones distribuidas y a duplicar el catálogo. Descartado.
- **App nueva desde cero:** habría que rehacer lo que esta ya resuelve (permisos, auditoría, inmutabilidad, IA evaluada). Descartado.
- **Llevar la fábrica a la app de la tienda:** esa app usa SQLite, todos sus usuarios son admin y no tiene inventario ni producción. Descartado.
