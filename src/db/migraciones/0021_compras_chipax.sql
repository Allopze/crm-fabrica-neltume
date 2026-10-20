-- Compras desde Chipax (ADR-0021, REQ-MP-7.x): proveedores, mapeos, facturas, líneas y corridas.
CREATE TABLE "compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chipax_id" bigint,
	"rut_emisor" text NOT NULL,
	"razon_social" text NOT NULL,
	"tipo" integer NOT NULL,
	"folio" bigint NOT NULL,
	"fecha_emision" date NOT NULL,
	"estado_chipax" text,
	"anulada" boolean DEFAULT false NOT NULL,
	"xml_pendiente" boolean DEFAULT true NOT NULL,
	"aviso" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"sincronizada_en" timestamp with time zone,
	CONSTRAINT "compra_documento" UNIQUE("rut_emisor","tipo","folio"),
	CONSTRAINT "compra_tipo" CHECK ("compra"."tipo" in (33, 34, 56, 61))
);
--> statement-breakpoint
CREATE TABLE "compra_linea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"nro_linea" integer NOT NULL,
	"codigo_item" text,
	"nombre_item" text NOT NULL,
	"clave" text NOT NULL,
	"cantidad" numeric(14, 6),
	"unidad" text,
	"precio_unitario" numeric(18, 6),
	"estado" text NOT NULL,
	"motivo_revision" text,
	"materia_prima_id" uuid,
	"cantidad_recibida" numeric(12, 3),
	"movimiento_id" uuid,
	"resuelta_por" uuid,
	"resuelta_en" timestamp with time zone,
	CONSTRAINT "compra_linea_nro" UNIQUE("compra_id","nro_linea"),
	CONSTRAINT "compra_linea_estado" CHECK ("compra_linea"."estado" in ('recibida', 'por_asociar', 'por_revisar', 'ignorada')),
	CONSTRAINT "compra_linea_recibida" CHECK ("compra_linea"."estado" <> 'recibida' OR ("compra_linea"."movimiento_id" IS NOT NULL AND "compra_linea"."materia_prima_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mapeo_item_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_rut" text NOT NULL,
	"clave" text NOT NULL,
	"descripcion" text NOT NULL,
	"materia_prima_id" uuid,
	"factor" numeric(14, 6),
	"unidad_facturada" text,
	"ignorar" boolean DEFAULT false NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mapeo_compra_clave" UNIQUE("proveedor_rut","clave"),
	CONSTRAINT "mapeo_destino" CHECK ("mapeo_item_compra"."ignorar" OR ("mapeo_item_compra"."materia_prima_id" IS NOT NULL AND "mapeo_item_compra"."factor" > 0))
);
--> statement-breakpoint
CREATE TABLE "proveedor_compra" (
	"rut" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"habilitado_desde" date NOT NULL,
	"habilitado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proveedor_nombre" CHECK (length(trim("proveedor_compra"."nombre")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sincronizacion_chipax" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"solicitada_por" uuid,
	"inicio" timestamp with time zone,
	"fin" timestamp with time zone,
	"resultado" text,
	"conteos" jsonb,
	"error" text,
	CONSTRAINT "sincronizacion_resultado" CHECK ("sincronizacion_chipax"."resultado" IS NULL OR "sincronizacion_chipax"."resultado" in ('ok', 'parcial', 'error'))
);
--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_materia_prima_id_materia_prima_id_fk" FOREIGN KEY ("materia_prima_id") REFERENCES "public"."materia_prima"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_movimiento_id_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimiento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_resuelta_por_usuario_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeo_item_compra" ADD CONSTRAINT "mapeo_item_compra_proveedor_rut_proveedor_compra_rut_fk" FOREIGN KEY ("proveedor_rut") REFERENCES "public"."proveedor_compra"("rut") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeo_item_compra" ADD CONSTRAINT "mapeo_item_compra_materia_prima_id_materia_prima_id_fk" FOREIGN KEY ("materia_prima_id") REFERENCES "public"."materia_prima"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeo_item_compra" ADD CONSTRAINT "mapeo_item_compra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor_compra" ADD CONSTRAINT "proveedor_compra_habilitado_por_usuario_id_fk" FOREIGN KEY ("habilitado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacion_chipax" ADD CONSTRAINT "sincronizacion_chipax_solicitada_por_usuario_id_fk" FOREIGN KEY ("solicitada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compra_fecha_idx" ON "compra" USING btree ("fecha_emision");--> statement-breakpoint
CREATE INDEX "compra_linea_pendiente_idx" ON "compra_linea" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "sincronizacion_fecha_idx" ON "sincronizacion_chipax" USING btree ("solicitada_en");--> statement-breakpoint
-- El rol del servicio de compras solo puede registrar recepciones de materias primas (ADR-0021, como ADR-0017).
-- `migrar` vuelve a crear la función con el nombre real del rol (DATABASE_URL_COMPRAS); aquí, el de omisión.
CREATE FUNCTION movimiento_rol_compras() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'neltume_compras' AND (NEW.tipo <> 'recepcion' OR NEW.materia_prima_id IS NULL) THEN
    RAISE EXCEPTION 'El servicio de compras solo registra recepciones de materias primas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimiento_rol_compras
  BEFORE INSERT ON movimiento
  FOR EACH ROW EXECUTE FUNCTION movimiento_rol_compras();
