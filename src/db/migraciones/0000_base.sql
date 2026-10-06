CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_tipo" text NOT NULL,
	"accion" text NOT NULL,
	"recurso" text NOT NULL,
	"recurso_id" text,
	"antes" jsonb,
	"despues" jsonb,
	"resultado" text NOT NULL,
	"origen" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"correlacion_id" text,
	CONSTRAINT "audit_resultado" CHECK ("audit_log"."resultado" in ('ok', 'denegado', 'error')),
	CONSTRAINT "audit_actor_tipo" CHECK ("audit_log"."actor_tipo" in ('usuario', 'visitante', 'sistema', 'worker'))
);
--> statement-breakpoint
CREATE TABLE "idempotencia" (
	"clave" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_cuerpo" text NOT NULL,
	"estado_http" integer NOT NULL,
	"respuesta" jsonb NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotencia_clave_usuario_id_pk" PRIMARY KEY("clave","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "intento_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"ok" boolean NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permiso" (
	"codigo" text PRIMARY KEY NOT NULL,
	"descripcion" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rol_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "rol_permiso" (
	"rol_id" uuid NOT NULL,
	"permiso_codigo" text NOT NULL,
	CONSTRAINT "rol_permiso_rol_id_permiso_codigo_pk" PRIMARY KEY("rol_id","permiso_codigo")
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"revocada_en" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sesion_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"hash_password" text NOT NULL,
	"rol_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email"),
	CONSTRAINT "usuario_email_minusculas" CHECK ("usuario"."email" = lower("usuario"."email"))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_usuario_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotencia" ADD CONSTRAINT "idempotencia_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_rol_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."rol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_codigo_permiso_codigo_fk" FOREIGN KEY ("permiso_codigo") REFERENCES "public"."permiso"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_rol_id_rol_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."rol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_recurso_idx" ON "audit_log" USING btree ("recurso","recurso_id");--> statement-breakpoint
CREATE INDEX "audit_fecha_idx" ON "audit_log" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "intento_login_email_idx" ON "intento_login" USING btree ("email","ocurrido_en");--> statement-breakpoint
CREATE INDEX "intento_login_ip_idx" ON "intento_login" USING btree ("ip","ocurrido_en");--> statement-breakpoint
CREATE INDEX "sesion_usuario_idx" ON "sesion" USING btree ("usuario_id");