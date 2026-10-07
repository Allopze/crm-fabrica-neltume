-- Defensa en profundidad (ADR-0017, auditoría M-02): invariantes que hoy solo protegía TypeScript.

-- 1. Antes de exigir saldos no negativos, los datos actuales deben cumplirlo: si no, la migración se detiene.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM v_stock WHERE existencia < 0 OR disponible < 0) THEN
    RAISE EXCEPTION 'Hay saldos de stock negativos: corrígelos con ajustes antes de migrar (SELECT * FROM v_stock WHERE existencia < 0 OR disponible < 0)';
  END IF;
END $$;
--> statement-breakpoint
-- 2. Stock: al confirmar la transacción, ningún ítem queda con existencia ni disponible negativos (REQ-STK-4.2, 7.3).
-- Diferido: se evalúa al final, cuando ya están todos los movimientos de la operación (despacho = liberación + salida).
CREATE FUNCTION movimiento_saldo_no_negativo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  existencia numeric;
  reservado numeric;
BEGIN
  SELECT coalesce(sum(cantidad) FILTER (WHERE tipo NOT IN ('reserva', 'liberacion')), 0),
         coalesce(sum(cantidad) FILTER (WHERE tipo IN ('reserva', 'liberacion')), 0)
    INTO existencia, reservado
    FROM movimiento
   WHERE bodega_id = NEW.bodega_id
     AND articulo_id IS NOT DISTINCT FROM NEW.articulo_id
     AND materia_prima_id IS NOT DISTINCT FROM NEW.materia_prima_id;
  IF existencia < 0 OR existencia - reservado < 0 THEN
    RAISE EXCEPTION 'El movimiento deja el stock en negativo (existencia %, disponible %)', existencia, existencia - reservado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER movimiento_saldo_no_negativo
  AFTER INSERT ON movimiento DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION movimiento_saldo_no_negativo();
--> statement-breakpoint
-- 3. Una nota de pedido despachada o cancelada es historia: ni ella ni sus ítems cambian (REQ-COT-8.5).
CREATE FUNCTION nota_pedido_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IN ('despachada', 'cancelada') THEN
    RAISE EXCEPTION 'La nota de pedido % está %: es de solo lectura', OLD.numero, OLD.estado USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER nota_pedido_solo_lectura_cerrada
  BEFORE UPDATE OR DELETE ON nota_pedido
  FOR EACH ROW EXECUTE FUNCTION nota_pedido_cerrada();
--> statement-breakpoint
CREATE FUNCTION pedido_item_cerrado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_padre text;
BEGIN
  SELECT estado INTO estado_padre FROM nota_pedido WHERE id = coalesce(NEW.nota_pedido_id, OLD.nota_pedido_id);
  IF estado_padre IN ('despachada', 'cancelada') THEN
    RAISE EXCEPTION 'Los ítems de una nota de pedido % son de solo lectura', estado_padre USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pedido_item_solo_lectura_cerrado
  BEFORE INSERT OR UPDATE OR DELETE ON pedido_item
  FOR EACH ROW EXECUTE FUNCTION pedido_item_cerrado();
--> statement-breakpoint
-- 4. El registro de llamadas al LLM es de solo inserción, como audit_log (REQ-COT-6.1). Reutiliza 0001.
CREATE TRIGGER llamada_ia_solo_insercion
  BEFORE UPDATE OR DELETE ON llamada_ia
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER llamada_ia_sin_truncate
  BEFORE TRUNCATE ON llamada_ia
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
