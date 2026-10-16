ALTER TABLE "ticketera_compra" ADD COLUMN "devueltaEn" TIMESTAMP(3);
ALTER TABLE "ticketera_compra" ADD COLUMN "contracargo" BOOLEAN NOT NULL DEFAULT false;
-- Freno de acaparamiento: reservas abiertas por IP (se guarda el hash, nunca la IP).
ALTER TABLE "ticketera_compra" ADD COLUMN "ipHash" TEXT;
-- Conciliación: cuándo se le preguntó a la pasarela por última vez.
ALTER TABLE "ticketera_compra" ADD COLUMN "conciliadaEn" TIMESTAMP(3);
CREATE INDEX "ticketera_compra_abiertas_idx" ON "ticketera_compra"("tenantId", "estado", "creadoEn") WHERE "estado" IN ('RESERVADA', 'VENCIDA');
ALTER TABLE "ticketera_entrada" ADD COLUMN "anuladaEn" TIMESTAMP(3);

-- Bandas con compras para conciliar (mandadas a pagar y sin pago registrado, en la ventana).
-- Cruza bandas: SECURITY DEFINER y SOLO ids. Lo de cada banda corre después con conTenant.
CREATE FUNCTION ticketera_bandas_a_conciliar(p_desde timestamp, p_hasta timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "ticketera_compra"
    WHERE "estado" IN ('RESERVADA', 'VENCIDA') AND "preferenciaId" IS NOT NULL
      AND "creadoEn" >= p_desde AND "creadoEn" <= p_hasta
  $$;
REVOKE ALL ON FUNCTION ticketera_bandas_a_conciliar(timestamp, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketera_bandas_a_conciliar(timestamp, timestamp) TO deoco_app;
