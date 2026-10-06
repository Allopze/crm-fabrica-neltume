CREATE TABLE "movimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"bodega_id" uuid NOT NULL,
	"articulo_id" uuid,
	"materia_prima_id" uuid,
	"tipo" text NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"motivo" text,
	"ref_tipo" text,
	"ref_id" text,
	"idempotencia_clave" text,
	"usuario_id" uuid NOT NULL,
	CONSTRAINT "movimiento_idempotenciaClave_unique" UNIQUE("idempotencia_clave"),
	CONSTRAINT "mov_item_xor" CHECK (("movimiento"."articulo_id" IS NULL) <> ("movimiento"."materia_prima_id" IS NULL)),
	CONSTRAINT "mov_tipo" CHECK ("movimiento"."tipo" in ('entrada_produccion', 'recepcion', 'salida_despacho', 'consumo_produccion', 'ajuste', 'reserva', 'liberacion')),
	CONSTRAINT "mov_cantidad_no_cero" CHECK ("movimiento"."cantidad" <> 0),
	CONSTRAINT "mov_signo" CHECK (("movimiento"."tipo" in ('entrada_produccion', 'recepcion', 'reserva') AND "movimiento"."cantidad" > 0)
    OR ("movimiento"."tipo" in ('salida_despacho', 'consumo_produccion', 'liberacion') AND "movimiento"."cantidad" < 0)
    OR "movimiento"."tipo" = 'ajuste'),
	CONSTRAINT "mov_ajuste_motivo" CHECK ("movimiento"."tipo" <> 'ajuste' OR length(trim(coalesce("movimiento"."motivo", ''))) > 0),
	CONSTRAINT "mov_reserva_solo_puertas" CHECK ("movimiento"."tipo" not in ('reserva', 'liberacion') OR "movimiento"."articulo_id" IS NOT NULL),
	CONSTRAINT "mov_puertas_enteras" CHECK ("movimiento"."articulo_id" IS NULL OR "movimiento"."cantidad" = trunc("movimiento"."cantidad"))
);
--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_bodega_id_bodega_id_fk" FOREIGN KEY ("bodega_id") REFERENCES "public"."bodega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mov_articulo_idx" ON "movimiento" USING btree ("articulo_id","bodega_id");--> statement-breakpoint
CREATE INDEX "mov_mp_idx" ON "movimiento" USING btree ("materia_prima_id","bodega_id");--> statement-breakpoint
CREATE INDEX "mov_ref_idx" ON "movimiento" USING btree ("ref_tipo","ref_id");