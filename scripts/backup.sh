#!/bin/sh
# Respaldos de la BD (DESIGN.md §6; REQ-NFR-4). Usa las variables de libpq (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#   sh backup.sh            bucle: un respaldo diario a las 02:00 (America/Santiago)
#   sh backup.sh --una-vez  un respaldo ahora (antes de un cambio riesgoso o para probar)
# Cada respaldo deja <base>.dump (pg_dump -Fc), <base>.conteos (filas de tablas clave al momento del respaldo) y
# <base>.sha256; los copia al destino externo montado en $BACKUP_EXTERNO_DIR y aplica la retención en ambos lados.
set -eu
DIR="${BACKUP_DIR:-/backups}"
EXTERNO="${BACKUP_EXTERNO_DIR:-/externo}"
BD="${PGDATABASE:-neltume}"
RETENCION="${BACKUP_RETENCION_DIAS:-30}"

log() { printf '{"nivel":"%s","servicio":"backup","mensaje":"%s"}\n' "$1" "$2"; }
suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
podar() { find "$1" -maxdepth 1 -name 'neltume-*' -mtime +"$RETENCION" -type f -delete; }

respaldar() {
  base="neltume-$(date +%Y%m%d-%H%M%S)"
  # Tablas que solo crecen: el respaldo restaurado debe tener al menos estas filas (restaurar-prueba.sh).
  psql -X -d "$BD" -Atc "SELECT 'movimiento', count(*) FROM movimiento UNION ALL SELECT 'cotizacion', count(*) FROM cotizacion UNION ALL SELECT 'audit_log', count(*) FROM audit_log" > "$DIR/$base.conteos"
  pg_dump -Fc -d "$BD" -f "$DIR/$base.dump.tmp"
  mv "$DIR/$base.dump.tmp" "$DIR/$base.dump"
  (cd "$DIR" && suma "$base.dump" > "$base.sha256")
  podar "$DIR"
  if [ -d "$EXTERNO" ] && [ -w "$EXTERNO" ]; then
    cp "$DIR/$base.dump" "$DIR/$base.conteos" "$DIR/$base.sha256" "$EXTERNO/"
    (cd "$EXTERNO" && suma -c "$base.sha256" >/dev/null) || { log error "la copia externa de $base no coincide"; return 1; }
    podar "$EXTERNO"
    log info "respaldo $base listo y copiado al destino externo"
  else
    log error "respaldo $base listo, pero el destino externo $EXTERNO no está montado o no se puede escribir"
  fi
  date +%Y-%m-%dT%H:%M:%S > "$DIR/ultimo-ok"
}

if [ "${1:-}" = "--una-vez" ]; then respaldar; exit 0; fi
log info "esperando las 02:00 para el respaldo diario"
while true; do
  if [ "$(date +%H%M)" = "0200" ]; then respaldar || log error "falló el respaldo"; sleep 60; fi
  sleep 30
done
