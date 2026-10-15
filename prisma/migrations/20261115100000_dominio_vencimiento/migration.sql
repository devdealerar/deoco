-- D11: renovación y salida de los dominios comprados.
--   venceEn: cuándo vence el registro. Comprado: lo informa el registrador (se actualiza al
--     renovar). Delegado o .com.ar: lo carga la banda si quiere que le avisemos.
--   vencidoEn: un comprado que venció sin renovar (el sitio volvió al subdominio; nada se borra).
--   vencidoEraPrincipal: era el principal al vencer (si lo renueva, vuelve a serlo).
--   transferenciaPedidaEn: la banda pidió el código para llevárselo a otro registrador.
ALTER TABLE "dominio" ADD COLUMN "venceEn" TIMESTAMP(3);
ALTER TABLE "dominio" ADD COLUMN "vencidoEn" TIMESTAMP(3);
ALTER TABLE "dominio" ADD COLUMN "vencidoEraPrincipal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dominio" ADD COLUMN "transferenciaPedidaEn" TIMESTAMP(3);

UPDATE "dominio" d SET "venceEn" = c."venceEn"
FROM (SELECT DISTINCT ON ("tenantId", "dominio") "tenantId", "dominio", "venceEn" FROM "dominio_compra"
      WHERE "estado" = 'listo' AND "venceEn" IS NOT NULL ORDER BY "tenantId", "dominio", "venceEn" DESC) c
WHERE d."comprado" AND d."tenantId" = c."tenantId" AND d."dominio" = c."dominio";

-- Cambio de titular registral: otra operación de la misma máquina (sin cobro).
ALTER TABLE "dominio_compra" DROP CONSTRAINT "dominio_compra_tipo";
ALTER TABLE "dominio_compra" ADD CONSTRAINT "dominio_compra_tipo" CHECK ("tipo" IN ('alta', 'renovacion', 'titular'));

-- Bandas con dominios que vencen antes de p_hasta, vencidos o con una transferencia pedida. Solo ids.
CREATE FUNCTION bandas_con_vencimientos(p_hasta timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "dominio"
    WHERE "venceEn" <= p_hasta OR "vencidoEn" IS NOT NULL OR "transferenciaPedidaEn" IS NOT NULL
  $$;
REVOKE ALL ON FUNCTION bandas_con_vencimientos(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_vencimientos(timestamp) TO deoco_app;
