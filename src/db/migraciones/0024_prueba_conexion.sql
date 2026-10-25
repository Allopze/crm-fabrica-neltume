-- Prueba de conexión con la tienda (ADR-0024). Generada con drizzle-kit; los permisos del rol `neltume_enlace` los aplica `migrar`.
CREATE TABLE "prueba_conexion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direccion" text NOT NULL,
	"event_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"hash_cuerpo" text NOT NULL,
	"contenido" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"nombre_archivo" text NOT NULL,
	"solicitud" "bytea",
	"cabeceras" jsonb,
	"firmada_en" timestamp with time zone,
	"creado_por" uuid,
	"tomada_en" timestamp with time zone,
	"destino" text,
	"http_status" integer,
	"codigo_error" text,
	"detalle" text,
	"latencia_ms" integer,
	"desfase_reloj_ms" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	CONSTRAINT "prueba_evento_unico" UNIQUE("direccion","event_id"),
	CONSTRAINT "prueba_direccion" CHECK ("prueba_conexion"."direccion" in ('enviada', 'recibida')),
	CONSTRAINT "prueba_estado" CHECK ("prueba_conexion"."estado" in ('recibida', 'pendiente', 'enviando', 'aceptada', 'duplicada', 'rechazada', 'sin_respuesta', 'no_configurada', 'vencida')),
	CONSTRAINT "prueba_estado_direccion" CHECK (("prueba_conexion"."direccion" = 'recibida') = ("prueba_conexion"."estado" = 'recibida')),
	CONSTRAINT "prueba_solicitud" CHECK (("prueba_conexion"."solicitud" IS NOT NULL) = ("prueba_conexion"."direccion" = 'enviada' AND "prueba_conexion"."estado" in ('pendiente', 'enviando'))),
	CONSTRAINT "prueba_cabeceras" CHECK (("prueba_conexion"."cabeceras" IS NULL) = ("prueba_conexion"."solicitud" IS NULL)),
	CONSTRAINT "prueba_autor" CHECK (("prueba_conexion"."creado_por" IS NOT NULL) = ("prueba_conexion"."direccion" = 'enviada')),
	CONSTRAINT "prueba_firma" CHECK (("prueba_conexion"."firmada_en" IS NOT NULL) = ("prueba_conexion"."direccion" = 'enviada')),
	CONSTRAINT "prueba_bytes" CHECK ("prueba_conexion"."bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "prueba_conexion" ADD CONSTRAINT "prueba_conexion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prueba_lista_idx" ON "prueba_conexion" USING btree ("direccion","creado_en");--> statement-breakpoint
CREATE INDEX "prueba_pendiente_idx" ON "prueba_conexion" USING btree ("creado_en") WHERE "prueba_conexion"."estado" = 'pendiente';