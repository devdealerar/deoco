-- DropIndex
DROP INDEX "dominio_dominio_key";

-- AlterTable
ALTER TABLE "dominio" ADD COLUMN     "token" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "verificadoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "dominio_dominio_idx" ON "dominio"("dominio");

-- CreateIndex
CREATE UNIQUE INDEX "dominio_tenantId_dominio_key" ON "dominio"("tenantId", "dominio");


-- Un dominio verificado pertenece a una sola banda. Sin verificar puede repetirse: lo
-- registra cualquiera, pero solo lo verifica quien controla su DNS (TXT con su token).
CREATE UNIQUE INDEX "dominio_verificado_unico" ON "dominio" ("dominio") WHERE "verificado";

-- El principal siempre está verificado. Antes se podía marcar uno sin verificar: se lo
-- desmarca y la banda vuelve a tener como principal uno verificado.
UPDATE "dominio" SET "esPrincipal" = false WHERE "esPrincipal" AND NOT "verificado";
UPDATE "dominio" SET "esPrincipal" = true WHERE "id" IN (
  SELECT DISTINCT ON ("tenantId") "id" FROM "dominio"
  WHERE "verificado" AND "tenantId" NOT IN (SELECT "tenantId" FROM "dominio" WHERE "esPrincipal")
  ORDER BY "tenantId", "dominio"
);
ALTER TABLE "dominio" ADD CONSTRAINT "dominio_principal_verificado" CHECK (NOT "esPrincipal" OR "verificado");

-- Solo resuelve un dominio verificado.
CREATE OR REPLACE FUNCTION resolver_tenant_por_host(host text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT "tenantId" FROM "dominio" WHERE "dominio" = lower(host) AND "verificado" LIMIT 1 $$;
