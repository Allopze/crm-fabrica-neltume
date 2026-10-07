-- Puertas con código, artículos fuera de catálogo e historial de despachos (ADR-0018, REQ-STK-8, 9, 10).
CREATE TABLE "despacho_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fila" integer NOT NULL,
	"codigo" text,
	"modelo" text,
	"medida" text,
	"madera" text,
	"fecha_produccion" date,
	"fecha_texto" text,
	"estado" text,
	"cliente" text,
	"documento" text,
	"nota" text,
	"dudas" text[] DEFAULT '{}'::text[] NOT NULL,
	"huella" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "despacho_historico_huella_unique" UNIQUE("huella")
);
--> statement-breakpoint
CREATE TABLE "puerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"articulo_id" uuid NOT NULL,
	"ancho_mm" integer,
	"alto_mm" integer,
	"ubicacion" text NOT NULL,
	"calidad" text DEFAULT 'primera' NOT NULL,
	"observacion" text,
	"fecha_produccion" date,
	"origen" text NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "puerta_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "puerta_id_articulo_uk" UNIQUE("id","articulo_id"),
	CONSTRAINT "puerta_calidad" CHECK ("puerta"."calidad" in ('primera', 'segunda')),
	CONSTRAINT "puerta_origen" CHECK ("puerta"."origen" in ('inventario_inicial', 'produccion', 'manual', 'conversion')),
	CONSTRAINT "puerta_codigo" CHECK (length("puerta"."codigo") between 3 and 40 AND "puerta"."codigo" = upper(trim("puerta"."codigo"))),
	CONSTRAINT "puerta_medida" CHECK (("puerta"."ancho_mm" IS NULL OR "puerta"."ancho_mm" between 100 and 4000) AND ("puerta"."alto_mm" IS NULL OR "puerta"."alto_mm" between 100 and 4000)),
	CONSTRAINT "puerta_ubicacion" CHECK (length(trim("puerta"."ubicacion")) > 0)
);
--> statement-breakpoint
ALTER TABLE "articulo" ADD COLUMN "fuera_catalogo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "madera" ADD COLUMN "fuera_catalogo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "modelo" ADD COLUMN "fuera_catalogo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "movimiento" ADD COLUMN "puerta_id" uuid;--> statement-breakpoint
ALTER TABLE "puerta" ADD CONSTRAINT "puerta_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puerta" ADD CONSTRAINT "puerta_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_codigo_idx" ON "despacho_historico" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "historico_documento_idx" ON "despacho_historico" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "puerta_articulo_idx" ON "puerta" USING btree ("articulo_id");--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "mov_puerta_fk" FOREIGN KEY ("puerta_id","articulo_id") REFERENCES "public"."puerta"("id","articulo_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mov_puerta_idx" ON "movimiento" USING btree ("puerta_id");--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "mov_puerta_unidad" CHECK ("movimiento"."puerta_id" IS NULL OR abs("movimiento"."cantidad") = 1);--> statement-breakpoint
-- Existencia y apartado de cada puerta, derivados de sus movimientos (REQ-STK-8.1, 8.5).
CREATE VIEW v_puerta AS
SELECT
  p.id AS puerta_id,
  coalesce(sum(m.cantidad) FILTER (WHERE m.tipo NOT IN ('reserva', 'liberacion')), 0)::int AS existencia,
  coalesce(sum(m.cantidad) FILTER (WHERE m.tipo IN ('reserva', 'liberacion')), 0)::int AS apartada
FROM puerta p
LEFT JOIN movimiento m ON m.puerta_id = p.id
GROUP BY p.id;
--> statement-breakpoint
-- Al confirmar: cada puerta está 0 o 1 vez en stock y 0 o 1 vez apartada, y nunca apartada fuera de stock.
CREATE FUNCTION movimiento_puerta_unitaria() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  existencia numeric;
  apartada numeric;
BEGIN
  SELECT coalesce(sum(cantidad) FILTER (WHERE tipo NOT IN ('reserva', 'liberacion')), 0),
         coalesce(sum(cantidad) FILTER (WHERE tipo IN ('reserva', 'liberacion')), 0)
    INTO existencia, apartada
    FROM movimiento
   WHERE puerta_id = NEW.puerta_id;
  IF existencia NOT IN (0, 1) OR apartada NOT IN (0, 1) OR apartada > existencia THEN
    RAISE EXCEPTION 'La puerta queda con existencia % y apartado %: solo se admiten 0 o 1', existencia, apartada
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER movimiento_puerta_unitaria
  AFTER INSERT ON movimiento DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.puerta_id IS NOT NULL) EXECUTE FUNCTION movimiento_puerta_unitaria();
--> statement-breakpoint
-- El stock de puertas que ya existía (por cantidad) pasa a puertas con código de la serie (los accesorios siguen por cantidad): un ajuste −N por artículo y
-- uno +1 por puerta nueva, con el mismo motivo. La existencia no cambia.
DO $$
DECLARE
  r record;
  autor uuid;
  siguiente bigint := 202308000010001;
  nueva uuid;
  total int := 0;
  motivo text := 'Conversión a puertas con código (ADR-0018)';
BEGIN
  SELECT id INTO autor FROM usuario ORDER BY creado_en LIMIT 1;
  FOR r IN
    SELECT s.articulo_id, s.bodega_id, sum(s.existencia)::int AS n FROM v_stock s
      JOIN articulo a ON a.id = s.articulo_id JOIN modelo m ON m.id = a.modelo_id
     WHERE m.familia = 'puerta' GROUP BY s.articulo_id, s.bodega_id HAVING sum(s.existencia) > 0 ORDER BY s.articulo_id
  LOOP
    INSERT INTO movimiento (bodega_id, articulo_id, tipo, cantidad, motivo, ref_tipo, usuario_id)
      VALUES (r.bodega_id, r.articulo_id, 'ajuste', -r.n, motivo, 'conversion', autor);
    FOR i IN 1..r.n LOOP
      INSERT INTO puerta (codigo, articulo_id, ubicacion, origen, creado_por)
        VALUES (siguiente::text, r.articulo_id, 'Fábrica', 'conversion', autor) RETURNING id INTO nueva;
      INSERT INTO movimiento (bodega_id, articulo_id, puerta_id, tipo, cantidad, motivo, ref_tipo, usuario_id)
        VALUES (r.bodega_id, r.articulo_id, nueva, 'ajuste', 1, motivo, 'conversion', autor);
      siguiente := siguiente + 1;
      total := total + 1;
    END LOOP;
  END LOOP;
  IF total > 0 THEN
    INSERT INTO audit_log (actor_tipo, accion, recurso, despues, resultado, origen)
      VALUES ('sistema', 'convertir a puertas', 'puerta', jsonb_build_object('puertas', total, 'migracion', '0019'), 'ok', 'consola');
  END IF;
END $$;
--> statement-breakpoint
-- Los triggers diferidos de la conversión se evalúan ya, antes de tocar otra vez la tabla.
SET CONSTRAINTS ALL IMMEDIATE;
--> statement-breakpoint
-- Desde aquí, toda entrada, salida o ajuste de un artículo de familia «puerta» mueve una puerta (un CHECK no ve la
-- familia del modelo). Las filas anteriores a ADR-0018 no se revisan: siguen siendo historia válida.
CREATE FUNCTION movimiento_puerta_requerida() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM articulo a JOIN modelo m ON m.id = a.modelo_id WHERE a.id = NEW.articulo_id AND m.familia = 'puerta') THEN
    RAISE EXCEPTION 'Una entrada, salida o ajuste de puertas debe indicar la puerta (mov_articulo_por_puerta)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimiento_puerta_requerida
  BEFORE INSERT ON movimiento
  FOR EACH ROW WHEN (NEW.articulo_id IS NOT NULL AND NEW.puerta_id IS NULL AND NEW.tipo NOT IN ('reserva', 'liberacion'))
  EXECUTE FUNCTION movimiento_puerta_requerida();
--> statement-breakpoint
-- El historial de despachos es de solo inserción, como movimiento y audit_log (REQ-STK-10.3).
CREATE TRIGGER despacho_historico_solo_insercion
  BEFORE UPDATE OR DELETE ON despacho_historico
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER despacho_historico_sin_truncate
  BEFORE TRUNCATE ON despacho_historico
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
