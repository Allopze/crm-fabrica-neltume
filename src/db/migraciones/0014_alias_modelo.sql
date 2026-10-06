CREATE TABLE "alias_modelo" (
	"alias" text PRIMARY KEY NOT NULL,
	"modelo" text NOT NULL,
	"tipo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alias_tipo" CHECK ("alias_modelo"."tipo" in ('seguro', 'posible'))
);
