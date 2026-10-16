ALTER TABLE "tienda_pedido" ADD COLUMN "devueltoEn" TIMESTAMP(3);
ALTER TABLE "tienda_pedido" ADD COLUMN "contracargo" BOOLEAN NOT NULL DEFAULT false;
-- Devuelto con algo ya mandado a producir: la banda lo resuelve con el proveedor.
ALTER TABLE "tienda_pedido" ADD COLUMN "resolverConProveedor" BOOLEAN NOT NULL DEFAULT false;
-- Conciliación: cuándo se le preguntó a la pasarela por última vez.
ALTER TABLE "tienda_pedido" ADD COLUMN "conciliadoEn" TIMESTAMP(3);
CREATE INDEX "tienda_pedido_pendientes_idx" ON "tienda_pedido"("tenantId", "creadoEn") WHERE "estado" = 'PENDIENTE';

-- Bandas con pedidos para conciliar o vencer (PENDIENTE, en la ventana). Cruza bandas:
-- SECURITY DEFINER y SOLO ids. Lo de cada banda corre después con conTenant.
CREATE FUNCTION tienda_bandas_a_conciliar(p_desde timestamp, p_hasta timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "tienda_pedido"
    WHERE "estado" = 'PENDIENTE' AND "creadoEn" >= p_desde AND "creadoEn" <= p_hasta
  $$;
REVOKE ALL ON FUNCTION tienda_bandas_a_conciliar(timestamp, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tienda_bandas_a_conciliar(timestamp, timestamp) TO deoco_app;
