CREATE TABLE "bom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modelo_id" uuid NOT NULL,
	"ancho_codigo" text,
	"alto_codigo" text,
	"origen" text NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "bom_origen" CHECK ("bom"."origen" in ('real', 'demo'))
);
--> statement-breakpoint
CREATE TABLE "bom_linea" (
	"bom_id" uuid NOT NULL,
	"materia_prima_id" uuid NOT NULL,
	"cantidad" numeric(12, 4) NOT NULL,
	CONSTRAINT "bom_linea_bom_id_materia_prima_id_pk" PRIMARY KEY("bom_id","materia_prima_id"),
	CONSTRAINT "bom_cantidad" CHECK ("bom_linea"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "materia_prima" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"unidad_codigo" text NOT NULL,
	"stock_minimo" numeric(12, 3),
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materia_prima_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "mp_minimo" CHECK ("materia_prima"."stock_minimo" IS NULL OR "materia_prima"."stock_minimo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orden_linea" (
	"orden_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	CONSTRAINT "orden_linea_orden_id_articulo_id_pk" PRIMARY KEY("orden_id","articulo_id"),
	CONSTRAINT "orden_linea_cantidad" CHECK ("orden_linea"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "orden_produccion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"nota_pedido_id" uuid,
	"observacion" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid NOT NULL,
	"cerrada_en" timestamp with time zone,
	"cerrado_por" uuid,
	CONSTRAINT "orden_produccion_numero_unique" UNIQUE("numero"),
	CONSTRAINT "orden_estado" CHECK ("orden_produccion"."estado" in ('abierta', 'cerrada', 'anulada'))
);
--> statement-breakpoint
CREATE TABLE "unidad" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_modelo_id_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_linea" ADD CONSTRAINT "bom_linea_bom_id_bom_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_linea" ADD CONSTRAINT "bom_linea_materia_prima_id_materia_prima_id_fk" FOREIGN KEY ("materia_prima_id") REFERENCES "public"."materia_prima"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materia_prima" ADD CONSTRAINT "materia_prima_unidad_codigo_unidad_codigo_fk" FOREIGN KEY ("unidad_codigo") REFERENCES "public"."unidad"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_linea" ADD CONSTRAINT "orden_linea_orden_id_orden_produccion_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden_produccion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_linea" ADD CONSTRAINT "orden_linea_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_cerrado_por_usuario_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_modelo_idx" ON "bom" USING btree ("modelo_id","vigente_desde");--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_materia_prima_id_materia_prima_id_fk" FOREIGN KEY ("materia_prima_id") REFERENCES "public"."materia_prima"("id") ON DELETE no action ON UPDATE no action;