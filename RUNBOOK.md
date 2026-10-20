# RUNBOOK.md — Operación

Pasos para levantar y operar el sistema. Nunca escribas secretos en este archivo ni en el repositorio: las claves de IA van en `.env.worker.local` durante desarrollo y en `.env` de producción, ambos ignorados por git.

## 1. Desarrollo local (sin Docker)

Requisitos: Node 24 (`.nvmrc`) y PostgreSQL local (Postgres.app en `localhost:5432`).

1. `npm install`
2. `cp .env.example .env.local` y completa la configuración de BD:
   - `DATABASE_ADMIN_URL`: superusuario local (Postgres.app: `postgres://<tu-usuario>@localhost:5432/postgres`).
   - `DATABASE_URL_OWNER`: `postgres://neltume_owner:<clave>@localhost:5432/neltume_dev`.
   - `DATABASE_URL`: `postgres://neltume_app:<clave>@localhost:5432/neltume_dev`.
   - Claves aleatorias: `openssl rand -hex 18`.
3. `cp .env.worker.example .env.worker.local` y pega las claves que usarás:
   - `CMD_API_KEY`: API key de Command Code.
   - `GROQ_API_KEY`: API key de Groq.
   Puedes configurar una o ambas. No las pongas en `.env.local`; el worker y `eval:ia` leen `.env.worker.local`.
4. `npm run db:setup`: crea los roles (dueño, app y `neltume_worker`, el rol con permisos mínimos del worker de IA, ADR-0017) y las bases `neltume_dev`, `neltume_test` y `neltume_e2e`. Es idempotente; vuelve a correrlo si actualizas desde una versión sin el rol del worker. En desarrollo la clave del worker se deriva de `DATABASE_URL` si no defines `DATABASE_URL_WORKER`.
5. `npm run crear-admin`: primer usuario. La contraseña se pide por consola.
6. `npm run dev`: migra la BD y levanta la app en `http://localhost:3000`. El worker carga las claves y actualiza los catálogos. Si agregas o cambias claves en `.env.worker.local` después de iniciarlo, reinicia `npm run dev` para que el worker las vuelva a cargar.
7. En **Ajustes de IA**, elige proveedor y modelo; para Groq confirma ZDR en Console.
8. `npm run eval:ia`: en la terminal, elige proveedor (1 Command Code, 2 Groq) y después el número del modelo en la tabla del catálogo. Command Code aparece ordenado por costo estimado por llamada (4.000 tokens de entrada y 400 de salida, menor primero); la tabla muestra tarifas y estimación. La tabla de Groq muestra los límites Free de referencia. Usa las claves de `.env.worker.local` y no cambia el proveedor activo. También acepta `--proveedor <commandcode|groq> --modelo <id>` y `--ids 1,17,34` para un diagnóstico breve; el informe guarda los hashes de prompt, casos y pipeline y no sobrescribe otro. Usa casos sintéticos y no requiere la confirmación ZDR de Ajustes; el worker debe haber actualizado el catálogo. Llama al servicio real y puede consumir cuota.

Pruebas: `npm test` (lint → typecheck → unit → integración → E2E). Siempre se corre completo. Recrea `neltume_test` y `neltume_e2e` y usa el Chrome instalado.

## 2. Producción (Docker Compose)

1. En el servidor: `cp .env.example .env` y completa las variables de BD y despliegue, además de `CMD_API_KEY` y/o `GROQ_API_KEY`. Compose entrega esas claves solo a `worker`. `DATABASE_URL_OWNER`, `DATABASE_URL` y `DATABASE_URL_WORKER` (usuario `neltume_worker`, clave propia; ADR-0017) apuntan a `@db:5432/neltume`.
2. `docker compose up -d --build`. El servicio `migrar` crea los roles y la base, aplica las migraciones y termina; luego arranca `app`.
3. Primer usuario: `docker compose run --rm -it migrar npx tsx scripts/crear-admin.mts`.
   - Lista de precios (si no se sube desde Precios → Importar): `docker compose run --rm -T -v /ruta/cotizador.xlsx:/tmp/cotizador.xlsx:ro migrar npx tsx scripts/importar-excel.mts /tmp/cotizador.xlsx`. Idempotente; audita a nombre del primer administrador y no imprime costos ni precios. Va **antes** de cargar el inventario: sin catálogo, toda puerta quedaría fuera de catálogo.
   - BOM reales (una vez; idempotente, no pisa lo editado después): `docker compose run --rm migrar npx tsx scripts/cargar-bom-real.mts`. En desarrollo: `npx tsx --env-file-if-exists=.env.local scripts/cargar-bom-real.mts` (ADR-0012).
   - Inventario de la fábrica (una vez, al pasar de la planilla a la app; ADR-0018): primero `--simular` y revisar el informe con la fábrica, después sin él. El Excel no va en la imagen: se monta solo para esa corrida, `docker compose run --rm -v /ruta/INVENTARIO.xlsx:/tmp/inventario.xlsx:ro migrar npx tsx scripts/cargar-inventario.mts /tmp/inventario.xlsx --simular`. En desarrollo: `npm run cargar-inventario -- datos/INVENTARIO.xlsx --simular`. Es idempotente (no repite puertas ni historial); se detiene si ya hay puertas en stock que no vienen de la planilla, salvo `--agregar`. Las filas sin código propio solo entran en la primera carga. Desde ese día la planilla deja de usarse.
4. Cotizador con IA: `docker compose --profile ia up -d worker` (o `COMPOSE_PROFILES=ia` en `.env`, que usa `npm run deploy`). Los cambios de proveedor/modelo en Ajustes rigen desde el siguiente trabajo; al rotar API keys, reinicia el worker.
6. Verifica la exposición:
   - `docker compose ps` no debe mostrar puertos publicados.
   - En el host, `ss -tlnp` no debe mostrar 5432 ni 3000 en `0.0.0.0`.

Despliegue desde el equipo de desarrollo: `npm run deploy` (`scripts/deploy.sh`). Requiere el `.env` de producción **fuera del repositorio**, en `~/.config/neltume/produccion.env` (u otra ruta con `DEPLOY_ENV_FILE`): dentro del repo, `next dev` lo cargaría y `next build` lo copiaría a `.next/standalone` (auditoría H-15). Para mover uno existente: `mkdir -p ~/.config/neltume && mv .env ~/.config/neltume/produccion.env && chmod 600 ~/.config/neltume/produccion.env && rm -rf .next/standalone`. El script rechaza un archivo cuyo `DATABASE_URL` o `DATABASE_URL_WORKER` no apunten a `@db:5432` y avisa si queda un `.env` en la raíz. Requiere SSH al host `debian` y `rsync` en ambos extremos. Sube por rsync lo que versiona git y aparte ese archivo como `.env` (con permisos 600) a `/server/crm_fabrica_puertas`, borra allí el código obsoleto (conserva `respaldos-externos/` y `datos/`) y ejecuta `docker compose up -d --build --remove-orphans`. Otro destino: `DEPLOY_HOST=… DEPLOY_DIR=… npm run deploy`. El primer usuario y los BOM reales (paso 3) siguen siendo manuales.

Acceso administrativo a la BD, solo desde el host: `docker compose -f docker-compose.yml -f docker-compose.admin.yml up -d db`. Expone `127.0.0.1:5432`. Ciérralo al terminar.

## 3. Cloudflare Tunnel (sin Access, ADR-0010)

1. Cloudflare Zero Trust → Networks → Tunnels → crear un túnel de tipo *cloudflared*. Copia el token a `TUNNEL_TOKEN` en `.env`.
2. En el túnel, agrega un *Public hostname*. Por ejemplo, `fabrica.<dominio>` → servicio `http://app:3000` (sin proxy intermedio, ADR-0011). Es la única ruta de entrada.
3. No se usa Cloudflare Access: la webapp queda pública y su login es la barrera. **Obligatorio** antes de abrir el acceso: en el dominio, Security → WAF → *Rate limiting rules*, una regla para `POST /api/v1/sesion` (por ejemplo, 20 peticiones por minuto por IP → bloquear 10 min) y otra para `/api/v1/*` sin la cookie `neltume_sesion` (por ejemplo, 120 por minuto por IP). Complementan el bloqueo propio del login y la auditoría agregada de denegaciones anónimas (SECURITY T7, ADR-0016).
4. Comprueba desde fuera de la red:
   - `https://fabrica.<dominio>` muestra el login de la app.
   - `curl -s https://fabrica.<dominio>/api/v1/salud` responde `{"estado":"ok"}` y nada más.
   - `curl -s -o /dev/null -w "%{http_code}" https://fabrica.<dominio>/api/v1/cotizaciones` responde `401` (sin sesión no hay datos).
   - Ningún puerto del host está abierto hacia internet (§2).

## 4. Salud, logs y respaldos

- Salud: `GET /api/v1/salud` responde `ok`, o `degradado` (503) si la BD no responde. Lo usan los healthchecks.
- Logs: JSON en stdout (`docker compose logs app`), con datos sensibles redactados. Cada error lleva su `correlacion_id`, que también se ve en pantalla y en `audit_log`.
- Respaldos: el servicio `backup` hace `pg_dump` diario a las 02:00 en el volumen `backups` (30 días) y lo copia a `BACKUP_DESTINO_EXTERNO`, verificando el checksum. `backups/ultimo-ok` guarda la fecha del último respaldo completo.
  - Respaldo manual (antes de un cambio riesgoso): `docker compose exec backup sh /backup.sh --una-vez`.
  - Revisar: `docker compose ps` muestra `backup` como *healthy*; queda *unhealthy* si no hubo un respaldo verificado en 26 h (el volcado se valida con `pg_restore --list`; un respaldo fallido no poda los anteriores ni actualiza `ultimo-ok`). `docker compose logs backup` no debe tener líneas `"nivel":"error"` (por ejemplo, destino externo sin montar).
- Prueba de restauración (mensual; meta < 2 h, pérdida máxima 24 h, REQ-NFR-4): `docker compose exec backup sh /restaurar-prueba.sh` restaura el último respaldo en una BD temporal, verifica checksum y conteos, informa el tiempo y la borra. Para probar la copia externa: `sh /restaurar-prueba.sh /externo/<archivo>.dump`. Anota fecha y resultado en el registro de abajo.
- Restaurar de verdad (desastre): detener `app` y `worker`; `docker compose exec backup pg_restore --clean --if-exists --no-owner --role=<usuario de DATABASE_URL_OWNER> -d neltume /backups/<archivo>.dump` (así las tablas siguen siendo del owner y las migraciones futuras funcionan); volver a correr `migrar` (reaplica permisos) y levantar todo.
- En desarrollo, con Postgres.app: exporta `PGHOST`, `PGUSER`, `PGPASSWORD` del superusuario, `PGDATABASE=neltume_dev`, `BACKUP_DIR` y `BACKUP_EXTERNO_DIR`, y corre los mismos scripts con `sh scripts/…`.

| Fecha | Respaldo | Resultado | Tiempo |
|---|---|---|---|
| 06-10-2026 | Local (dev, Postgres 18) con copia externa simulada | Checksum y conteos OK; copia alterada rechazada | < 1 s |

## 5. Incidentes frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `npm run dev` dice "No se pudo migrar" | PostgreSQL apagado o falta `db:setup` | Abre Postgres.app y ejecuta `npm run db:setup` |
| Login responde "Demasiados intentos" | 5 fallos en 15 min (por correo o IP) | Esperar 15 min; queda auditado |
| La app no arranca en producción | `migrar` falló | `docker compose logs migrar` |
| Un usuario quedó sin acceso | Desactivado o rol sin permisos | Otro administrador lo reactiva en Usuarios y permisos |
| «Falta el abono» o «Falta pagar el saldo» bloquea producir o despachar | La nota exige pago (ADR-0020) | Registrar el pago en la ficha, o la excepción con motivo; el % de abono es el parámetro `abono_pct` (50): `UPDATE parametro SET valor = '40' WHERE clave = 'abono_pct'` |
| Un pago se registró mal | Los pagos no se editan ni se borran | «Revertir» con motivo en la ficha y registrar el correcto |

**Actualizaciones** (la app está expuesta sin Access): revisar mensualmente `npm audit --omit=dev` y los avisos de seguridad de Next.js; aplicar los parches de seguridad sin esperar al ciclo mensual. Al revisar un aviso, importa si el paquete va a producción y si el código vulnerable es alcanzable (p. ej., `uuid` dentro de `exceljs` no recibe `buf`); no apliques el «fix» que propone `npm audit` cuando es un downgrade mayor. En el mismo ciclo, renueva los digests de las imágenes de `docker-compose.yml` y la base del `Dockerfile` (`docker buildx imagetools inspect <imagen>`).

## 6. Demo: preparación y guion (T1.43)

**Preparar** (una vez, en el entorno de demo; idempotente):
1. `npm run crear-admin` si la base está vacía.
2. `npm run demo:preparar`: migra, importa `datos/Cotizador Puertas Neltume.Co-rev-4E.xlsx` (lista v1), crea 3 clientes ficticios, materias primas y BOM de ejemplo (NEL, MOL, ANC, marcados *demo*), recepciones y stock inicial: 2 NEL-R-4-B, 4 LIC-L-4-B, 6 ANC-O-3-A y 1 MOL-L-4-B. No imprime precios ni costos.
3. Ajustes de IA: activa el proveedor elegido; para pruebas deterministas sin un proveedor activo, usa `LLM_PROVEEDOR=doble` (reconoce los textos de `tests/fixtures/ia-respuestas.json`).
4. `npm run dev` y abre `http://localhost:3000`.

**Guion** (unos 20 minutos; cada paso cita lo que demuestra):

| # | Pantalla | Acción | Qué mostrar |
|---|---|---|---|
| 1 | Login → Panel | Ingresar | Borradores, alertas bajo mínimo y pedidos con faltante (UX §1) |
| 2 | Ajustes de IA | Elegir proveedor/modelo; las claves están en el entorno del worker; en Groq confirmar ZDR en Console | Catálogo y precios/límites tienen fecha (REQ-ADM-4.x) |
| 3 | Precios | Ver la lista v1 y el informe de importación; fijar recargos por tipo | 29 filas rechazadas con motivo; cada cambio crea una versión nueva (REQ-COT-1.x) |
| 4 | Stock → NEL-R-4-B | Ver existencia 2; registrar un ajuste sin motivo y luego con motivo | Movimientos inmutables; el ajuste exige motivo (REQ-STK-5) |
| 5 | Materias primas → Producción | Recepción de cola; orden de 2 MOL-L-4-B y cerrarla | Consume insumos según el BOM *demo* y suma puertas (REQ-MP-2–4) |
| 6 | Cotizaciones → Desde texto | Cliente: Constructora Los Alerces. Texto: «Necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa y 2 Toltén raulí de 87x215» | Aviso «disponible 2 · faltan 1», roble *por confirmar*, Toltén *a pedido*; «Ver lo que recibió la IA» (REQ-COT-2) |
| 7 | Revisión | Quitar el roble; en Toltén «Usar referencia» y «Fijar precio» | Nada se completa en silencio; el precio a pedido lo fija una persona (REQ-COT-2.5, 3) |
| 8 | Revisión | Aprobar y descargar el PDF | Precios congelados, vigencia de 10 días hábiles, «flete aparte» (REQ-COT-4, 6) |
| 9 | Convertir en pedido | Transporte: «Camión propio»; confirmar; PDF de la nota | Reserva 2, faltante 1 visible; stock disponible 0 (REQ-STK-7, REQ-COT-8) |
| 10 | Cotizar a mano | 1 LIC-L-4-B para Ferretería Puyehue | Mismo cálculo que con IA (REQ-COT-5) |
| 11 | Precios | Editar el precio de NEL-R-4-B | La cotización aprobada no cambia; un borrador ofrece «Recalcular» (REQ-COT-6.2, 6.3) |
| 12 | Auditoría | Filtrar por actor y por resultado | Quién hizo qué y cuándo, con antes/después (REQ-ADM-3) |

Si la IA no responde, el borrador queda en «IA no disponible» con el texto guardado y el botón «Cotizar a mano» (REQ-COT-2.7). Con el doble determinista, el texto «simular IA caída» lo provoca.
