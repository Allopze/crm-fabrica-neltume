CREATE TABLE "madera_insumo" (
	"madera_id" uuid PRIMARY KEY NOT NULL,
	"materia_prima_id" uuid NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom_linea" DROP CONSTRAINT "bom_linea_bom_id_materia_prima_id_pk";--> statement-breakpoint
ALTER TABLE "bom_linea" ALTER COLUMN "materia_prima_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_linea" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_linea" ADD COLUMN "madera_puerta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "madera_insumo" ADD CONSTRAINT "madera_insumo_madera_id_madera_id_fk" FOREIGN KEY ("madera_id") REFERENCES "public"."madera"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "madera_insumo" ADD CONSTRAINT "madera_insumo_materia_prima_id_materia_prima_id_fk" FOREIGN KEY ("materia_prima_id") REFERENCES "public"."materia_prima"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_linea_insumo_uk" ON "bom_linea" USING btree ("bom_id","materia_prima_id") WHERE "bom_linea"."materia_prima_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_linea_madera_uk" ON "bom_linea" USING btree ("bom_id") WHERE "bom_linea"."madera_puerta";--> statement-breakpoint
ALTER TABLE "bom_linea" ADD CONSTRAINT "bom_linea_tipo" CHECK (("bom_linea"."madera_puerta" AND "bom_linea"."materia_prima_id" IS NULL) OR (NOT "bom_linea"."madera_puerta" AND "bom_linea"."materia_prima_id" IS NOT NULL));