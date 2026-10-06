# ADR-0011 — Túnel directo a la app, sin proxy Caddy

**Estado:** aceptado (aprobado por el usuario, 06-10-2026) · **Refs:** SECURITY §2, §6 y T8, DESIGN §1 y §4, AGENTS regla 10 · modifica ADR-0005 (fila Proxy / túnel)

## Contexto
Entre `cloudflared` y la app había un Caddy con tres funciones: único destino del túnel, encabezados de seguridad y límite del cuerpo (1 MB, y 6 MB para el Excel). TLS ya lo termina Cloudflare (ADR-0010), así que Caddy solo sumaba un contenedor y un archivo de configuración aparte. Ese archivo además se desalineó: limitaba a 1 MB el PDF de la nota de la tienda, que admite 5 MB (ADR-0008).

## Decisión
- El túnel apunta directo a `http://app:3000`. El servicio `tunnel` está en `borde` (para salir a Cloudflare) y en `backend` (interna, donde solo está la app). La BD, el worker y el respaldo siguen en otras redes, así que el aislamiento es el mismo.
- Los **encabezados de seguridad** (HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) salen de `headers()` en `next.config.ts`, para toda ruta. `X-Powered-By` sigue apagado.
- El **límite del cuerpo** está en el wrapper de la API (`conPermiso` y `publico`, `src/domain/auth/politica.ts`) y se aplica antes de leer el cuerpo y antes de validar la sesión:
  - Por defecto es 1 MB. Las cargas del Excel y del PDF de la nota declaran `maxCuerpo` de 6 MB: un archivo de 5 MB más el sobre multipart.
  - Con `Content-Length`, se rechaza sin leer nada: 413 (`CUERPO_GRANDE`).
  - Sin `Content-Length` (envío por trozos; `cloudflared` puede reenviar así una petición aunque el navegador haya declarado el largo), se lee contando bytes y se corta con 413 al pasar el máximo. Nunca se acumula más que el límite. No se rechaza por falta de largo, porque eso bloquearía las peticiones legítimas que llegan por el túnel.
  - Cloudflare además corta todo cuerpo sobre 100 MB.

## Consecuencias
- Un contenedor y un archivo de configuración menos. Los límites viven junto a cada ruta y tienen pruebas (`salud.test.ts`, `compose.test.ts`).
- Se corrige el límite del PDF de la nota de la tienda: ahora es 6 MB, igual que el del Excel.
- Las páginas no-API no tienen un límite propio de cuerpo. La app no usa server actions ni formularios fuera de `/api/v1`, y Cloudflare corta sobre 100 MB.

## Alternativas
- **Mantener Caddy:** funciona, pero duplica configuración y ya se había desalineado.
- **Encabezados con Transform Rules de Cloudflare:** quedarían fuera del repo y sin pruebas.
