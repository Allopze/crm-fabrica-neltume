-- Tablas de solo inserción (REQ-ADM-3.3, ADR-0002): el trigger rechaza UPDATE, DELETE y TRUNCATE
-- incluso para el dueño del esquema. El rol de la app además no tiene esos permisos (src/db/migrar.ts).
CREATE FUNCTION rechazar_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción: % no permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_solo_insercion
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER audit_log_sin_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
