-- D10: una compra que espera un dato del titular (el registrador lo rechazó) no queda esperando
-- para siempre con la plata cobrada: si la banda no lo corrige en 7 días, falla sin registrar y
-- el pago se devuelve. "datosDesde": desde cuándo espera.
ALTER TABLE "dominio_compra" ADD COLUMN "datosDesde" TIMESTAMP(3);
UPDATE "dominio_compra" SET "datosDesde" = now() WHERE "estado" = 'datos';

-- Bandas con compras esperando un dato desde antes de p_limite. Solo ids.
CREATE FUNCTION bandas_con_datos_vencidos(p_limite timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "dominio_compra" WHERE "estado" = 'datos' AND "datosDesde" < p_limite
  $$;
REVOKE ALL ON FUNCTION bandas_con_datos_vencidos(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_datos_vencidos(timestamp) TO deoco_app;
