# ADR-0010 — Exposición por Cloudflare Tunnel sin Cloudflare Access

**Estado:** aceptado (decisión del usuario, 06-10-2026) · **Refs:** REQ-NFR-3, REQ-ADM-1.x, SECURITY T7 y §6, AGENTS regla 10 · modifica ADR-0005 (fila Auth)

## Contexto
El plan ponía Cloudflare Access delante de todo el hostname, como defensa en profundidad: solo los correos autorizados llegaban al login de la app. El usuario decidió no usar Access: `cloudflared` se usa solo para exponer la webapp a internet.

## Decisión
- La webapp se publica en internet únicamente por Cloudflare Tunnel (`cloudflared` → `proxy` → `app`). Se mantiene la regla 10 de AGENTS: el host no abre puertos y la BD y los paneles nunca se publican.
- No hay Cloudflare Access: el **login propio es la única barrera de entrada**.
- Superficie sin sesión: la página de login, `POST /api/v1/sesion`, `GET /api/v1/salud` (solo `ok`/`degradado`) y los estáticos. Todo lo demás exige sesión y permiso (`conPermiso`, denegado por defecto), y sin sesión responde 401.
- Defensas que ya existen y pasan a ser las principales (SECURITY T7):
  - argon2id con mínimo de 8 caracteres;
  - 5 fallos cada 15 min por correo **o** por IP (también frena un ataque repartido entre IPs contra una cuenta);
  - mensaje único y hash falso, para no revelar si un correo existe;
  - cookie `HttpOnly`, `Secure` y `SameSite=Lax`, sesión de 8 h y CSRF en mutaciones;
  - auditoría de cada intento.
- Se agregan dos medidas operativas, sin código:
  - una regla de limitación de Cloudflare para `POST /api/v1/sesion` (RUNBOOK §3);
  - revisión mensual de parches de Next.js y de las dependencias (RUNBOOK §5).

## Consecuencias
- Las personas entran con su correo y contraseña de la app, sin un paso previo de Cloudflare.
- Aumenta la exposición: cualquiera en internet ve el login. Riesgo aceptado: un atacante puede bloquear una cuenta durante 15 min con 5 fallos.
- Si más adelante se quiere reforzar, hay opciones sin cambiar la arquitectura: un segundo factor (TOTP) en el login, o volver a poner Access.

## Alternativas
- **Cloudflare Access delante (plan anterior):** el usuario la descartó.
- **Abrir un puerto en el host o usar un proxy público propio:** viola la regla 10 de AGENTS.
