# Producto — Neltume Fábrica

<!-- impeccable:product-schema 1 -->

Este registro reúne hechos del producto para orientar futuros trabajos de interfaz. Las decisiones abiertas se indican como tales. Fuentes: AGENTS.md, SPEC.md, UX.md y TASKS.md; las cifras de SPEC.md aún requieren validación en uso real.

## Platform

web

## Users

- Personal interno de la fábrica Neltume. Hoy un mismo perfil realiza ventas, bodega, producción y gerencia, y puede ver costos y márgenes. El sistema evalúa permisos por acción para sumar otros perfiles después (REQ-ADM-2.2).
- Los clientes directos y la tienda son actores externos sin acceso a la app (SPEC.md §3).
- **Decisión abierta:** identificar a la persona o equipo que la usará primero en la operación diaria. La documentación define funciones, pero no confirma quiénes ocuparán ese perfil.

## Product Purpose

Gestionar en una sola webapp interna el catálogo y stock de puertas, materias primas y recetas de fabricación, producción, cotizaciones y notas de pedido. Sustituye la búsqueda y el cálculo manual en Excel y hace visible la disponibilidad antes de comprometer una entrega (SPEC.md §1; REQ-STK-2.1; REQ-COT-2.6).

SPEC.md §1 fija como metas una cotización estándar aprobada en hasta 3 minutos, cero importes o stock inventados por IA, una diferencia de stock físico de hasta 2 % en conteos cíclicos y trazabilidad completa de cada cotización. Son objetivos del proyecto, no resultados observados.

## Positioning

El cotizador transforma texto libre de pedidos en una propuesta de ítems para revisión humana. El modelo de IA solo interpreta; el catálogo y las reglas del backend determinan productos, disponibilidad, precios, impuestos y vigencia. Las coincidencias inciertas quedan visibles como «por confirmar» y bloquean la aprobación hasta que una persona las resuelva (REQ-COT-2.2–2.5; REQ-COT-3.3).

## Operating Context

- Canal de entrada único: la webapp. El usuario pega el pedido recibido, revisa lado a lado el texto y los ítems propuestos, resuelve dudas, aprueba y descarga el PDF para enviarlo por su cuenta (UX.md §3; REQ-COT-4.4).
- La fábrica recibe notas de pedido de la tienda en PDF y puede convertirlas en pedidos internos, con reserva, producción de faltantes y despacho (REQ-COT-8.5–8.9).
- El catálogo y la lista inicial de precios provienen de las hojas «Precio» y «Categorias» del cotizador Excel de Neltume. La lista se versiona; cada cotización conserva los precios con los que fue aprobada (REQ-STK-1.1; REQ-COT-1.1; REQ-COT-6.1).
- Uso principal en PC con internet estable. En celular, las pantallas deben seguir siendo legibles y operables sin flujos exclusivos para ese formato (REQ-NFR-6; UX.md §1).

## Capabilities and Constraints

- Stock de puertas y materias primas, movimientos inmutables, reservas, alertas, recetas de materiales, órdenes de producción y ajustes con motivo (REQ-STK; REQ-MP).
- Cotizaciones asistidas por IA o manuales, precios calculados desde datos de la app, descuentos excepcionales con motivo, aprobación humana, PDF y notas de pedido (REQ-COT).
- El texto enviado a IA oculta RUT, correo y teléfono; el modelo no recibe precios, stock ni datos de clientes, ni tiene capacidad de escritura (AGENTS.md; REQ-COT-2.9).
- Autorización por permiso en el backend y registro de auditoría de las acciones que modifican datos (REQ-ADM-2.2; REQ-ADM-3.1).
- Español en UI y documentos; CLP como importes enteros; precios netos y con IVA de 19 %; números y fechas en formato chileno (REQ-NFR-9).
- Fuera del alcance actual: facturación electrónica, portal de clientes, venta de la tienda, envío automático, entrada por correo o mensajería, flete calculado, terminaciones, herrajes, enchapadas y modo sin conexión (SPEC.md §1, §8).
- El trabajo de aplicación avanza por fases y checkpoints de TASKS.md; una decisión de producto que cambie requisitos se propone en SPEC/DESIGN/AI/ADR antes de implementarla (AGENTS.md).

## Brand Commitments

El nombre de la fábrica es Neltume. El repositorio incluye el logo oficial en `public/marca/logo-neltume.svg`, usado por la app y los PDF (REQ-COT-4.2; TASKS.md T5.2). La comunicación operativa es en español y usa la terminología de fábrica: puerta, madera, medida, materia prima, receta/BOM, cotización, nota de pedido, reserva y despacho.

## Evidence on Hand

- `SPEC.md`, `UX.md` y `TASKS.md`: requisitos, flujos y alcance por fases.
- `public/marca/logo-neltume.svg`: marca oficial ya incorporada.
- `datos/Cotizador Puertas Neltume.Co-rev-4F.xlsx`: fuente operativa de catálogo y precios, fuera de git y de solo lectura; sus costos y márgenes no deben copiarse a documentación, ejemplos ni registros.
- La cifra de 50–200 cotizaciones al mes y la línea base de 5–15 minutos por cotización figuran en SPEC.md §1; no se presentan como mediciones verificadas de la app.

## Product Principles

1. La persona conserva el control de toda cotización: ve la interpretación, resuelve incertidumbres y aprueba antes de emitir un PDF.
2. El catálogo, los precios y el stock tienen una única fuente de verdad trazable; la IA no los inventa.
3. Los movimientos, versiones y aprobaciones conservan el historial necesario para reconstruir cada decisión.
4. La interfaz muestra faltantes, errores y estados pendientes donde se toma la decisión, sin completar información ambigua en silencio.

## Accessibility & Inclusion

UX.md exige navegación por teclado en tablas anchas, cierre del menú móvil con Escape, controles táctiles de al menos 44 px y estados comunicados con texto además de color. La lectura en celular forma parte de REQ-NFR-6.
