CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"tipo" text DEFAULT 'directo' NOT NULL,
	"giro" text,
	"direccion" text,
	"direccion_despacho" text,
	"comuna" text,
	"contacto" text,
	"email" text,
	"telefono" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_rut_unique" UNIQUE("rut"),
	CONSTRAINT "cliente_tipo" CHECK ("cliente"."tipo" in ('tienda', 'directo'))
);
--> statement-breakpoint
CREATE INDEX "cliente_nombre_idx" ON "cliente" USING btree ("nombre");