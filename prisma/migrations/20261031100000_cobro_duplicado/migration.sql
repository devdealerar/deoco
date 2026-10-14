-- Pagos duplicados de cualquier módulo que cobra: una tabla del núcleo, una sola forma.
-- Antes cada módulo tenía la suya (la tienda, una tabla; la ticketera, texto en `observacion`).

-- CreateTable
CREATE TABLE "cobro_duplicado" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_duplicado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cobro_duplicado_tenantId_moduloId_referencia_idx" ON "cobro_duplicado"("tenantId", "moduloId", "referencia");

-- CreateIndex
CREATE UNIQUE INDEX "cobro_duplicado_tenantId_pasarela_cobroId_key" ON "cobro_duplicado"("tenantId", "pasarela", "cobroId");

-- AddForeignKey
ALTER TABLE "cobro_duplicado" ADD CONSTRAINT "cobro_duplicado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_aislar_tabla('cobro_duplicado');

-- Para que la migración de un módulo pase a esta tabla lo que guardaba a su manera, sin tocar
-- una tabla del núcleo con su propio SQL (como deoco_aislar_tabla). Solo para migraciones: la
-- app no la puede llamar. Repetida, no duplica.
CREATE FUNCTION deoco_importar_cobro_duplicado(
  p_tenant uuid, p_modulo text, p_referencia text, p_pasarela text, p_cobro text, p_monto integer, p_moneda text, p_creado timestamp(3)
) RETURNS void
  LANGUAGE sql
  AS $$
    INSERT INTO "cobro_duplicado" ("id", "tenantId", "moduloId", "referencia", "pasarela", "cobroId", "monto", "moneda", "creadoEn")
    VALUES (gen_random_uuid(), p_tenant, p_modulo, p_referencia, p_pasarela, p_cobro, p_monto, p_moneda, p_creado)
    ON CONFLICT ("tenantId", "pasarela", "cobroId") DO NOTHING
  $$;
REVOKE ALL ON FUNCTION deoco_importar_cobro_duplicado(uuid, text, text, text, text, integer, text, timestamp) FROM PUBLIC;
