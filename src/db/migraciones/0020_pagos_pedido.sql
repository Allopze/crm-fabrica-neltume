-- Pagos de la nota de pedido (ADR-0020, REQ-COT-8.10–8.14).
CREATE TABLE "pago_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nota_pedido_id" uuid NOT NULL,
	"monto" bigint NOT NULL,
	"fecha" date NOT NULL,
	"medio" text NOT NULL,
	"referencia" text,
	"revierte_id" uuid,
	"motivo" text,
	"registrado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_pedido_revierteId_unique" UNIQUE("revierte_id"),
	CONSTRAINT "pago_medio" CHECK ("pago_pedido"."medio" in ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro')),
	CONSTRAINT "pago_signo" CHECK (("pago_pedido"."revierte_id" IS NULL AND "pago_pedido"."monto" > 0) OR ("pago_pedido"."revierte_id" IS NOT NULL AND "pago_pedido"."monto" < 0 AND length(trim(coalesce("pago_pedido"."motivo", ''))) > 0))
);
--> statement-breakpoint
-- Las notas existentes no exigen pago (ADR-0020): se agrega en false, sin UPDATE (las cerradas son de solo lectura), y las nuevas nacen en true.
ALTER TABLE "nota_pedido" ADD COLUMN "exige_pago" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nota_pedido" ALTER COLUMN "exige_pago" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_abono_motivo" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_abono_por" uuid;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_abono_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_saldo_motivo" text;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_saldo_por" uuid;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD COLUMN "excepcion_saldo_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pago_pedido" ADD CONSTRAINT "pago_pedido_nota_pedido_id_nota_pedido_id_fk" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."nota_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_pedido" ADD CONSTRAINT "pago_pedido_revierte_id_pago_pedido_id_fk" FOREIGN KEY ("revierte_id") REFERENCES "public"."pago_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_pedido" ADD CONSTRAINT "pago_pedido_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pago_pedido_nota_idx" ON "pago_pedido" USING btree ("nota_pedido_id","creado_en");--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_excepcion_abono_por_usuario_id_fk" FOREIGN KEY ("excepcion_abono_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "nota_pedido_excepcion_saldo_por_usuario_id_fk" FOREIGN KEY ("excepcion_saldo_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_excepcion_abono" CHECK (("nota_pedido"."excepcion_abono_en" IS NULL) = ("nota_pedido"."excepcion_abono_motivo" IS NULL) AND ("nota_pedido"."excepcion_abono_en" IS NULL) = ("nota_pedido"."excepcion_abono_por" IS NULL) AND length(trim(coalesce("nota_pedido"."excepcion_abono_motivo", 'x'))) > 0);--> statement-breakpoint
ALTER TABLE "nota_pedido" ADD CONSTRAINT "pedido_excepcion_saldo" CHECK (("nota_pedido"."excepcion_saldo_en" IS NULL) = ("nota_pedido"."excepcion_saldo_motivo" IS NULL) AND ("nota_pedido"."excepcion_saldo_en" IS NULL) = ("nota_pedido"."excepcion_saldo_por" IS NULL) AND length(trim(coalesce("nota_pedido"."excepcion_saldo_motivo", 'x'))) > 0);--> statement-breakpoint
-- Pagos de solo inserción, como los movimientos (ADR-0002): ni UPDATE, ni DELETE, ni TRUNCATE.
CREATE TRIGGER pago_pedido_solo_insercion
  BEFORE UPDATE OR DELETE ON pago_pedido
  FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
CREATE TRIGGER pago_pedido_sin_truncate
  BEFORE TRUNCATE ON pago_pedido
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_modificacion();
--> statement-breakpoint
-- Invariantes en la BD (ADR-0017): no se paga una nota cancelada, y un reverso anula exactamente un pago de la misma nota.
CREATE FUNCTION pago_pedido_valido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original pago_pedido%ROWTYPE;
BEGIN
  IF NEW.revierte_id IS NULL THEN
    IF (SELECT estado FROM nota_pedido WHERE id = NEW.nota_pedido_id) = 'cancelada' THEN
      RAISE EXCEPTION 'No se registran pagos en una nota de pedido cancelada' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO original FROM pago_pedido WHERE id = NEW.revierte_id;
  IF original.nota_pedido_id IS DISTINCT FROM NEW.nota_pedido_id OR original.revierte_id IS NOT NULL OR NEW.monto <> -original.monto THEN
    RAISE EXCEPTION 'Un reverso anula un pago de la misma nota por el mismo monto' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pago_pedido_validacion
  BEFORE INSERT ON pago_pedido
  FOR EACH ROW EXECUTE FUNCTION pago_pedido_valido();
