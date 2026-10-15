-- Devoluciones de las compras de dominios (D9). La plata la cobró el gestor de cuenta en la
-- cuenta de Deoco: la compra solo le pide que devuelva. pendiente: todavía no se le pidió (o el
-- gestor no la pudo anotar); pedida: la tiene el gestor, que la corre, la reintenta y, si no
-- sale, la muestra al staff.
ALTER TABLE "dominio_compra" DROP CONSTRAINT "dominio_compra_devolucion";
UPDATE "dominio_compra" SET "devolucion" = 'pedida' WHERE "devolucion" = 'hecha';
ALTER TABLE "dominio_compra" ADD CONSTRAINT "dominio_compra_devolucion" CHECK ("devolucion" IS NULL OR "devolucion" IN ('pendiente', 'pedida'));
CREATE INDEX "dominio_compra_devolucion_pendiente" ON "dominio_compra"("tenantId") WHERE "devolucion" = 'pendiente';

-- Bandas con devoluciones sin pedir. Solo ids.
CREATE FUNCTION bandas_con_devoluciones_pendientes() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "dominio_compra" WHERE "devolucion" = 'pendiente'
  $$;
REVOKE ALL ON FUNCTION bandas_con_devoluciones_pendientes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_devoluciones_pendientes() TO deoco_app;
