#!/bin/sh
# Prueba de restauración (DESIGN.md §6; REQ-NFR-4): restaura un respaldo en una BD temporal, verifica el checksum y
# que movimiento, cotizacion y audit_log tengan al menos las filas que había al respaldar, mide el tiempo y borra la BD.
#   sh restaurar-prueba.sh [ruta.dump]   (por defecto, el último de $BACKUP_DIR)
# Requiere un usuario con CREATEDB (en Compose, el superusuario del servicio db).
set -eu
DIR="${BACKUP_DIR:-/backups}"
dump="${1:-$(ls -1t "$DIR"/neltume-*.dump 2>/dev/null | head -1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "✗ No hay respaldos en $DIR"; exit 1; }
base="${dump%.dump}"
suma() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

inicio=$(date +%s)
(cd "$(dirname "$dump")" && suma -c "$(basename "$base").sha256" >/dev/null) || { echo "✗ El checksum de $dump no coincide"; exit 1; }
echo "✓ checksum de $(basename "$dump")"

tmp="neltume_restauracion_$(date +%s)"
createdb "$tmp"
trap 'dropdb --if-exists "$tmp" >/dev/null 2>&1 || true' EXIT
pg_restore --no-owner --no-privileges --exit-on-error -d "$tmp" "$dump"
echo "✓ restaurado en $tmp"

fallas=0
while IFS='|' read -r tabla esperado; do
  real=$(psql -X -d "$tmp" -Atc "SELECT count(*) FROM $tabla")
  if [ "$real" -ge "$esperado" ]; then echo "✓ $tabla: $real filas (al respaldar: $esperado)"; else echo "✗ $tabla: $real filas, se esperaban al menos $esperado"; fallas=1; fi
done < "$base.conteos"

segundos=$(( $(date +%s) - inicio ))
[ "$fallas" -eq 0 ] || { echo "✗ Restauración con diferencias"; exit 1; }
echo "✓ Restauración probada en ${segundos} s (meta < 2 h)"
