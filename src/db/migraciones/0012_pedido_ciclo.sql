ALTER TABLE "nota_pedido" ADD COLUMN "entrega_comprometida" date;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "observaciones" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "lista_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "despachada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "despachada_por" uuid;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD COLUMN "medida_solicitada" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_despachada_por_usuario_id_fk" FOREIGN KEY ("despachada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;