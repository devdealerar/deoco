-- Un módulo que el plan ya no incluye pero que tiene operaciones abiertas (entradas vendidas,
-- pedidos sin despachar, cobros en curso) queda prendido como EXCEDENTE hasta que se cierren:
-- un cambio de plan nunca corta una venta (3.2, núcleo d5). Lo apaga el gestor cuando ya no
-- queda nada abierto.
ALTER TABLE "moduloTenant" ADD COLUMN "excedenteDesde" TIMESTAMP(3);
ALTER TABLE "moduloTenant" ADD COLUMN "excedenteMotivo" TEXT;

-- Bandas con algún módulo en excedente, para que el gestor las revise en el barrido. Cruza
-- bandas: SECURITY DEFINER y SOLO ids.
CREATE FUNCTION bandas_con_excedente() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT "tenantId" FROM "moduloTenant" WHERE "excedenteDesde" IS NOT NULL $$;
REVOKE ALL ON FUNCTION bandas_con_excedente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_excedente() TO deoco_app;
