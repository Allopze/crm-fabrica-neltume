-- Movimientos inmutables (ADR-0002, REQ-STK-5.3): ni UPDATE, ni DELETE, ni TRUNCATE.
CREATE TRIGGER movimiento_solo_insercion
  BEFORE UPDATE OR DELETE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER movimiento_sin_truncate
  BEFORE TRUNCATE ON movimiento
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
-- Saldo derivado (REQ-STK-2.1): existencia sin reservas; reservado = reservas − liberaciones.
CREATE VIEW v_stock AS
SELECT
  articulo_id,
  materia_prima_id,
  bodega_id,
  coalesce(sum(cantidad) FILTER (WHERE tipo NOT IN ('reserva', 'liberacion')), 0) AS existencia,
  coalesce(sum(cantidad) FILTER (WHERE tipo IN ('reserva', 'liberacion')), 0) AS reservado,
  coalesce(sum(cantidad) FILTER (WHERE tipo NOT IN ('reserva', 'liberacion')), 0)
    - coalesce(sum(cantidad) FILTER (WHERE tipo IN ('reserva', 'liberacion')), 0) AS disponible
FROM movimiento
GROUP BY articulo_id, materia_prima_id, bodega_id;
