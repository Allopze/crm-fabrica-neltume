ALTER TABLE "nota_pedido" ALTER COLUMN "cotizacion_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "origen" text DEFAULT 'cotizacion' NOT NULL;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "ref_externa" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "archivo_hash" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "proyecto" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_nota_tienda_unica" UNIQUE("cliente_id","ref_externa");--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_archivo_unico" UNIQUE("archivo_hash");--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_origen" CHECK (("nota_pedido"."origen" = 'cotizacion' AND "nota_pedido"."cotizacion_id" IS NOT NULL) OR ("nota_pedido"."origen" = 'nota_tienda' AND "nota_pedido"."ref_externa" IS NOT NULL AND "nota_pedido"."archivo_hash" IS NOT NULL));