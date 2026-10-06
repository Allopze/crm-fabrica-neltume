CREATE TABLE "cotizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"cliente_id" uuid,
	"estado" text NOT NULL,
	"origen" text NOT NULL,
	"texto_original" text,
	"interpretacion_ia" jsonb,
	"alertas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lista_id" uuid,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"descuento_pct" numeric(5, 4) DEFAULT 0 NOT NULL,
	"descuento_motivo" text,
	"descuento" bigint DEFAULT 0 NOT NULL,
	"neto" bigint DEFAULT 0 NOT NULL,
	"iva" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"vigencia_hasta" date,
	"notas" text,
	"aprobada_por" uuid,
	"aprobada_en" timestamp with time zone,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cotizacion_numero_unique" UNIQUE("numero"),
	CONSTRAINT "cotizacion_estado" CHECK ("cotizacion"."estado" in ('interpretando', 'borrador', 'ia_fallida', 'aprobada', 'aceptada')),
	CONSTRAINT "cotizacion_origen" CHECK ("cotizacion"."origen" in ('ia', 'manual')),
	CONSTRAINT "cotizacion_descuento" CHECK ("cotizacion"."descuento_pct" >= 0 AND "cotizacion"."descuento_pct" < 1 AND ("cotizacion"."descuento_pct" = 0 OR length(trim(coalesce("cotizacion"."descuento_motivo", ''))) > 0))
);
--> statement-breakpoint
CREATE TABLE "cotizacion_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cotizacion_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" integer NOT NULL,
	"estado_item" text NOT NULL,
	"duda" text,
	"texto_fuente" text,
	"precio_neto_lista" numeric(14, 4),
	"recargo_pct" numeric(6, 4),
	"precio_unitario" bigint,
	"total_linea" bigint,
	"precio_referencia" bigint,
	"referencia_codigo" text,
	"fijado_por" uuid,
	"modificado_por" uuid,
	"modificado_en" timestamp with time zone,
	CONSTRAINT "item_estado" CHECK ("cotizacion_item"."estado_item" in ('ok', 'por_confirmar', 'a_pedido')),
	CONSTRAINT "item_cantidad" CHECK ("cotizacion_item"."cantidad" > 0),
	CONSTRAINT "item_ok_con_precio" CHECK ("cotizacion_item"."estado_item" <> 'ok' OR ("cotizacion_item"."precio_unitario" IS NOT NULL AND "cotizacion_item"."total_linea" = "cotizacion_item"."precio_unitario" * "cotizacion_item"."cantidad"))
);
--> statement-breakpoint
CREATE TABLE "llamada_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trabajo_id" uuid NOT NULL,
	"proveedor" text NOT NULL,
	"modelo" text,
	"entrada_redactada" text NOT NULL,
	"salida" jsonb,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_usd" numeric(10, 6),
	"latencia_ms" integer,
	"resultado" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trabajo_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cotizacion_id" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"tomado_en" timestamp with time zone,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trabajo_estado" CHECK ("trabajo_ia"."estado" in ('pendiente', 'en_curso', 'listo', 'fallido'))
);
--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_lista_id_lista_precio_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista_precio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_aprobada_por_usuario_id_fk" FOREIGN KEY ("aprobada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_fijado_por_usuario_id_fk" FOREIGN KEY ("fijado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_modificado_por_usuario_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llamada_ia" ADD CONSTRAINT "llamada_ia_trabajo_id_trabajo_ia_id_fk" FOREIGN KEY ("trabajo_id") REFERENCES "public"."trabajo_ia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajo_ia" ADD CONSTRAINT "trabajo_ia_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cotizacion_estado_idx" ON "cotizacion" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "cotizacion_cliente_idx" ON "cotizacion" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "item_cotizacion_idx" ON "cotizacion_item" USING btree ("cotizacion_id","orden");--> statement-breakpoint
CREATE INDEX "llamada_fecha_idx" ON "llamada_ia" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "trabajo_pendiente_idx" ON "trabajo_ia" USING btree ("estado","creado_en");