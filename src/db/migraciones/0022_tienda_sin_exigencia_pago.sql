-- La tienda no exige abono ni saldo (REQ-COT-8.17, decidido el 20-10-2026; ADR-0020 §9). Las notas abiertas de
-- clientes tipo tienda dejan de exigir pago; los pagos ya registrados se conservan. Un registro de auditoría por nota.
WITH cambiadas AS (
  UPDATE nota_pedido n SET exige_pago = false
  FROM cliente c
  WHERE c.id = n.cliente_id AND c.tipo = 'tienda' AND n.exige_pago AND n.estado NOT IN ('despachada', 'cancelada')
  RETURNING n.id, n.numero
)
INSERT INTO audit_log (actor_tipo, accion, recurso, recurso_id, antes, despues, resultado, origen)
SELECT 'sistema', 'tienda sin exigencia de pago', 'nota_pedido', id::text, jsonb_build_object('exigePago', true),
  jsonb_build_object('exigePago', false, 'numero', numero, 'migracion', '0022'), 'ok', 'consola'
FROM cambiadas;
