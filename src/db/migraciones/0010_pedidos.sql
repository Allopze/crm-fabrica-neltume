CREATE TABLE "nota_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"cotizacion_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"direccion_despacho" text,
	"medio_transporte" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelada_por" uuid,
	"cancelada_en" timestamp with time zone,
	"motivo_cancelacion" text,
	CONSTRAINT "nota_pedido_numero_unique" UNIQUE("numero"),
	CONSTRAINT "nota_pedido_cotizacionId_unique" UNIQUE("cotizacion_id"),
	CONSTRAINT "pedido_estado" CHECK ("nota_pedido"."estado" in ('pendiente', 'en_produccion', 'lista', 'despachada', 'cancelada')),
	CONSTRAINT "pedido_cancelacion" CHECK ("nota_pedido"."estado" <> 'cancelada' OR length(trim(coalesce("nota_pedido"."motivo_cancelacion", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nota_pedido_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" integer NOT NULL,
	"reservado" integer DEFAULT 0 NOT NULL,
	"faltante" integer DEFAULT 0 NOT NULL,
	"precio_unitario" bigint NOT NULL,
	"total_linea" bigint NOT NULL,
	CONSTRAINT "pedido_item_cantidades" CHECK ("pedido_item"."cantidad" > 0 AND "pedido_item"."reservado" >= 0 AND "pedido_item"."faltante" >= 0 AND "pedido_item"."reservado" + "pedido_item"."faltante" = "pedido_item"."cantidad")
);
--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_cancelada_por_usuario_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_nota_pedido_id_nota_pedido_id_fk" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."nota_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_estado_idx" ON "nota_pedido" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "pedido_item_pedido_idx" ON "pedido_item" USING btree ("nota_pedido_id","orden");--> statement-breakpoint
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_nota_pedido_id_nota_pedido_id_fk" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."nota_pedido"("id") ON DELETE no action ON UPDATE no action;