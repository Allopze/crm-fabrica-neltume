-- Recepción automática de las notas de pedido de la tienda (ADR-0023). Generada con drizzle-kit; triggers al final.
CREATE TABLE "adjunto_tienda" (
	"sha256" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"contenido" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjunto_mime" CHECK ("adjunto_tienda"."mime" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);
--> statement-breakpoint
CREATE TABLE "documento_tienda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recepcion_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"contenido" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"nombre_origen" text NOT NULL,
	"retenido" boolean DEFAULT false NOT NULL,
	"motivo_retencion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documento_por_recepcion" UNIQUE("recepcion_id","tipo"),
	CONSTRAINT "documento_tipo" CHECK ("documento_tienda"."tipo" in ('comercial', 'produccion')),
	CONSTRAINT "documento_retencion" CHECK ("documento_tienda"."retenido" = ("documento_tienda"."motivo_retencion" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recepcion_tienda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotencia_clave" text NOT NULL,
	"event_id" uuid NOT NULL,
	"hash_cuerpo" text NOT NULL,
	"tipo_evento" text NOT NULL,
	"source_order_id" text NOT NULL,
	"revision" integer NOT NULL,
	"numero_nota" text NOT NULL,
	"nota_pedido_id" uuid,
	"estado" text NOT NULL,
	"payload" jsonb NOT NULL,
	"comercial" jsonb,
	"avisos" text[] DEFAULT '{}' NOT NULL,
	"resuelta_por" uuid,
	"resuelta_en" timestamp with time zone,
	"motivo_resolucion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recepcion_tienda_idempotenciaClave_unique" UNIQUE("idempotencia_clave"),
	CONSTRAINT "recepcion_tienda_eventId_unique" UNIQUE("event_id"),
	CONSTRAINT "recepcion_revision_unica" UNIQUE("source_order_id","revision"),
	CONSTRAINT "recepcion_estado" CHECK ("recepcion_tienda"."estado" in ('incorporada', 'pendiente_revision', 'anulacion_solicitada', 'aplicada', 'descartada', 'cancelada', 'registrada')),
	CONSTRAINT "recepcion_evento" CHECK ("recepcion_tienda"."tipo_evento" in ('order.ready', 'order.cancelled')),
	CONSTRAINT "recepcion_revision" CHECK ("recepcion_tienda"."revision" > 0),
	CONSTRAINT "recepcion_resolucion" CHECK (("recepcion_tienda"."resuelta_en" IS NULL) = ("recepcion_tienda"."resuelta_por" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "nota_pedido" DROP CONSTRAINT "pedido_nota_tienda_unica";--> statement-breakpoint
ALTER TABLE "nota_pedido" DROP CONSTRAINT "pedido_origen";--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "revision_externa" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "reemplaza_id" uuid;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD COLUMN "observacion" text;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD COLUMN "revisar" text;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD COLUMN "referencias" jsonb;--> statement-breakpoint
ALTER TABLE "documento_tienda" ADD CONSTRAINT "documento_tienda_recepcion_id_recepcion_tienda_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepcion_tienda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_tienda" ADD CONSTRAINT "recepcion_tienda_nota_pedido_id_nota_pedido_id_fk" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."nota_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_tienda" ADD CONSTRAINT "recepcion_tienda_resuelta_por_usuario_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recepcion_nota_idx" ON "recepcion_tienda" USING btree ("nota_pedido_id");--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_reemplaza_id_nota_pedido_id_fk" FOREIGN KEY ("reemplaza_id") REFERENCES "public"."nota_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_nota_tienda_unica" UNIQUE("cliente_id","ref_externa","revision_externa");--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_revision_externa" CHECK ("nota_pedido"."revision_externa" > 0);--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_origen" CHECK (("nota_pedido"."origen" = 'cotizacion' AND "nota_pedido"."cotizacion_id" IS NOT NULL) OR ("nota_pedido"."origen" = 'nota_tienda' AND "nota_pedido"."ref_externa" IS NOT NULL AND "nota_pedido"."archivo_hash" IS NOT NULL) OR ("nota_pedido"."origen" = 'tienda_api' AND "nota_pedido"."ref_externa" IS NOT NULL));--> statement-breakpoint
-- Documentos y adjuntos de la tienda: de solo inserción, como los movimientos (ADR-0002). Una revisión trae los suyos.
CREATE TRIGGER documento_tienda_solo_insercion
  BEFORE UPDATE OR DELETE ON documento_tienda
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER documento_tienda_sin_truncate
  BEFORE TRUNCATE ON documento_tienda
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER adjunto_tienda_solo_insercion
  BEFORE UPDATE OR DELETE ON adjunto_tienda
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER adjunto_tienda_sin_truncate
  BEFORE TRUNCATE ON adjunto_tienda
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
