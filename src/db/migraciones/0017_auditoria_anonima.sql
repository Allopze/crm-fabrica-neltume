-- Denegaciones anónimas agregadas por IP (ADR-0016, auditoría H-08): índice para la ventana de 15 min.
CREATE INDEX "audit_visitante_ip_idx" ON "audit_log" USING btree ("ip","ocurrido_en") WHERE "audit_log"."actor_tipo" = 'visitante';
