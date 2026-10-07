#!/bin/sh
# Respaldos de la BD (DESIGN.md §6; REQ-NFR-4). Usa las variables de libpq (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#   sh backup.sh            bucle: un respaldo diario a las 02:00 (America/Santiago)
#   sh backup.sh --una-vez  un respaldo ahora (antes de un cambio riesgoso o para probar)
# Cada respaldo deja <base>.dump (pg_dump -Fc), <base>.conteos (filas de tablas clave al momento del respaldo) y
# <base>.sha256; los copia al destino externo montado en $BACKUP_EXTERNO_DIR y aplica la retención en ambos lados.
# Un respaldo que falla termina con error, no poda los anteriores ni actualiza `ultimo-ok` (auditoría H-01): el bucle
# lanza cada respaldo como un proceso aparte, porque `set -e` no rige dentro de una función llamada con `||`.
set -eu
DIR="${BACKUP_DIR:-/backups}"
EXTERNO="${BACKUP_EXTERNO_DIR:-/externo}"
BD="${PGDATABASE:-neltume}"
RETENCION="${BACKUP_RETENCION_DIAS:-30}"

log() { printf '{"nivel":"%s","servicio":"backup","mensaje":"%s"}\n' "$1" "$2"; }
suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
podar() { find "$1" -maxdepth 1 -name 'neltume-*' -mtime +"$RETENCION" -type f -delete; }
falla() { log error "$1"; exit 1; }

respaldar() {
  base="neltume-$(date +%Y%m%d-%H%M%S)"
  tmp="$DIR/$base.dump.tmp"
  # Si falla, no deja restos: ni el volcado temporal ni los conteos de un respaldo que no existe.
  trap 'rm -f "$tmp"; [ -f "$DIR/$base.dump" ] || rm -f "$DIR/$base.conteos"' EXIT
  # Tablas que solo crecen: el respaldo restaurado debe tener al menos estas filas (restaurar-prueba.sh).
  psql -X -d "$BD" -Atc "SELECT 'movimiento', count(*) FROM movimiento UNION ALL SELECT 'cotizacion', count(*) FROM cotizacion UNION ALL SELECT 'audit_log', count(*) FROM audit_log" > "$DIR/$base.conteos" \
    || falla "respaldo $base: no se pudieron contar las filas"
  [ "$(wc -l < "$DIR/$base.conteos")" -ge 3 ] || falla "respaldo $base: conteos incompletos"
  pg_dump -Fc -d "$BD" -f "$tmp" || falla "respaldo $base: pg_dump falló"
  # Un volcado truncado no se lista: nunca se publica como respaldo bueno.
  pg_restore --list "$tmp" > /dev/null || falla "respaldo $base: el volcado no es legible"
  mv "$tmp" "$DIR/$base.dump"
  (cd "$DIR" && suma "$base.dump" > "$base.sha256") || falla "respaldo $base: no se pudo calcular el checksum"
  if [ -d "$EXTERNO" ] && [ -w "$EXTERNO" ]; then
    cp "$DIR/$base.dump" "$DIR/$base.conteos" "$DIR/$base.sha256" "$EXTERNO/" || falla "respaldo $base: no se pudo copiar al destino externo"
    (cd "$EXTERNO" && suma -c "$base.sha256" >/dev/null) || falla "la copia externa de $base no coincide"
    podar "$EXTERNO"
    log info "respaldo $base listo y copiado al destino externo"
  else
    log error "respaldo $base listo, pero el destino externo $EXTERNO no está montado o no se puede escribir"
  fi
  # Solo con un respaldo local verificado se poda lo antiguo y se marca el último correcto.
  podar "$DIR"
  date +%Y-%m-%dT%H:%M:%S > "$DIR/ultimo-ok"
}

if [ "${1:-}" = "--una-vez" ]; then respaldar; exit 0; fi
log info "esperando las 02:00 para el respaldo diario"
while true; do
  if [ "$(date +%H%M)" = "0200" ]; then sh "$0" --una-vez || log error "falló el respaldo diario: se conservan los anteriores"; sleep 60; fi
  sleep 30
done
