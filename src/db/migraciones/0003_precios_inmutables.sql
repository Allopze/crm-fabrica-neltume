-- Las versiones de lista son históricas (REQ-COT-1.1, 6.2): un precio nunca se edita ni se borra;
-- un cambio crea una versión nueva. Reutiliza rechazar_modificacion() de 0001.
CREATE TRIGGER precio_solo_insercion
  BEFORE UPDATE OR DELETE ON precio
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER precio_sin_truncate
  BEFORE TRUNCATE ON precio
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
