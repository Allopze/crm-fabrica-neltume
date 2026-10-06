-- Una cotización aprobada es de solo lectura (REQ-COT-6.1, 6.2, 6.5): solo puede pasar de aprobada a aceptada.
CREATE FUNCTION cotizacion_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado IN ('aprobada', 'aceptada') THEN
      RAISE EXCEPTION 'La cotización % está %: no se puede borrar', OLD.numero, OLD.estado USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado IN ('aprobada', 'aceptada') THEN
    IF OLD.estado = 'aprobada' AND NEW.estado = 'aceptada'
       AND (to_jsonb(NEW) - 'estado' - 'actualizado_en' - 'version') = (to_jsonb(OLD) - 'estado' - 'actualizado_en' - 'version') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'La cotización % está %: es de solo lectura', OLD.numero, OLD.estado USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cotizacion_solo_lectura_aprobada
  BEFORE UPDATE OR DELETE ON cotizacion
  FOR EACH ROW EXECUTE FUNCTION cotizacion_inmutable();
--> statement-breakpoint
CREATE FUNCTION cotizacion_item_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_padre text;
BEGIN
  SELECT estado INTO estado_padre FROM cotizacion WHERE id = coalesce(NEW.cotizacion_id, OLD.cotizacion_id);
  IF estado_padre IN ('aprobada', 'aceptada') THEN
    RAISE EXCEPTION 'Los ítems de una cotización % son de solo lectura', estado_padre USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cotizacion_item_solo_lectura
  BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_item
  FOR EACH ROW EXECUTE FUNCTION cotizacion_item_inmutable();
