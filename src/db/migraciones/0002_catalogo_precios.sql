CREATE TABLE "alto" (
	"codigo" text PRIMARY KEY NOT NULL,
	"alto_m" numeric(4, 2) NOT NULL,
	CONSTRAINT "alto_altoM_unique" UNIQUE("alto_m")
);
--> statement-breakpoint
CREATE TABLE "articulo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"modelo_id" uuid NOT NULL,
	"madera_id" uuid NOT NULL,
	"ancho_codigo" text NOT NULL,
	"ancho_etiqueta" text NOT NULL,
	"alto_codigo" text NOT NULL,
	"alto_m" numeric(4, 2) NOT NULL,
	"espesor" numeric(4, 1),
	"pulgadas" numeric(10, 4),
	"tipo_puerta_id" uuid,
	"stock_minimo" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articulo_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "articulo_minimo" CHECK ("articulo"."stock_minimo" IS NULL OR "articulo"."stock_minimo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bodega" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "bodega_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "feriado" (
	"fecha" date PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archivo_hash" text NOT NULL,
	"nombre_archivo" text NOT NULL,
	"lista_id" uuid,
	"creadas" integer NOT NULL,
	"actualizadas" integer NOT NULL,
	"sin_cambios" integer NOT NULL,
	"rechazadas" integer NOT NULL,
	"rechazos" jsonb NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lista_precio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" serial NOT NULL,
	"origen" text NOT NULL,
	"archivo_hash" text,
	"descripcion" text NOT NULL,
	"vigente" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lista_precio_version_unique" UNIQUE("version"),
	CONSTRAINT "lista_origen" CHECK ("lista_precio"."origen" in ('excel', 'edicion'))
);
--> statement-breakpoint
CREATE TABLE "madera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text NOT NULL,
	CONSTRAINT "madera_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "madera_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "modelo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text NOT NULL,
	"familia" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "modelo_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "modelo_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "modelo_familia" CHECK ("modelo"."familia" in ('puerta', 'accesorio'))
);
--> statement-breakpoint
CREATE TABLE "parametro" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precio" (
	"lista_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"costo_produccion" numeric(14, 4),
	"costo_materiales" numeric(14, 4),
	"costo_insumos" numeric(14, 4),
	"costos_generales" numeric(14, 4),
	"costo_total" numeric(14, 4),
	"margen" numeric(6, 4),
	"precio_neto" numeric(14, 4) NOT NULL,
	CONSTRAINT "precio_lista_id_articulo_id_pk" PRIMARY KEY("lista_id","articulo_id"),
	CONSTRAINT "precio_positivo" CHECK ("precio"."precio_neto" > 0)
);
--> statement-breakpoint
CREATE TABLE "rango_ancho" (
	"codigo" text PRIMARY KEY NOT NULL,
	"etiqueta" text NOT NULL,
	"min_m" numeric(4, 2) NOT NULL,
	"max_m" numeric(4, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recargo_tipo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lista_id" uuid NOT NULL,
	"tipo_puerta_id" uuid,
	"porcentaje" numeric(6, 4) NOT NULL,
	CONSTRAINT "recargo_lista_tipo_uk" UNIQUE NULLS NOT DISTINCT("lista_id","tipo_puerta_id"),
	CONSTRAINT "recargo_rango" CHECK ("recargo_tipo"."porcentaje" >= 0 AND "recargo_tipo"."porcentaje" < 5)
);
--> statement-breakpoint
CREATE TABLE "tipo_puerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "tipo_puerta_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "articulo" ADD CONSTRAINT "articulo_modelo_id_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulo" ADD CONSTRAINT "articulo_madera_id_madera_id_fk" FOREIGN KEY ("madera_id") REFERENCES "public"."madera"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulo" ADD CONSTRAINT "articulo_tipo_puerta_id_tipo_puerta_id_fk" FOREIGN KEY ("tipo_puerta_id") REFERENCES "public"."tipo_puerta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacion" ADD CONSTRAINT "importacion_lista_id_lista_precio_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista_precio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacion" ADD CONSTRAINT "importacion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_precio" ADD CONSTRAINT "lista_precio_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precio" ADD CONSTRAINT "precio_lista_id_lista_precio_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista_precio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precio" ADD CONSTRAINT "precio_articulo_id_articulo_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recargo_tipo" ADD CONSTRAINT "recargo_tipo_lista_id_lista_precio_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista_precio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recargo_tipo" ADD CONSTRAINT "recargo_tipo_tipo_puerta_id_tipo_puerta_id_fk" FOREIGN KEY ("tipo_puerta_id") REFERENCES "public"."tipo_puerta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "articulo_variante_uk" ON "articulo" USING btree ("modelo_id","madera_id","ancho_codigo","alto_codigo");--> statement-breakpoint
CREATE INDEX "importacion_hash_idx" ON "importacion" USING btree ("archivo_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "lista_una_vigente" ON "lista_precio" USING btree ("vigente") WHERE "lista_precio"."vigente";