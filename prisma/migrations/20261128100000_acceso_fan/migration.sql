-- Área del fan (D5; documento maestro "Mis compras": enlace seguro, sin contraseña). El fan pide
-- un link a su mail; el link sirve una vez y vence a los 30 minutos (pedir otro invalida el
-- anterior); al abrirlo, el navegador queda con una sesión de ese sitio por 30 días. En la base,
-- solo los hashes.
CREATE TABLE "acceso_fan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "linkHash" TEXT,
    "linkVence" TIMESTAMP(3) NOT NULL,
    "linkUsadoEn" TIMESTAMP(3),
    "sesionHash" TEXT,
    "sesionVence" TIMESTAMP(3),
    "cerradaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acceso_fan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "acceso_fan_linkHash_key" ON "acceso_fan"("linkHash");
CREATE UNIQUE INDEX "acceso_fan_sesionHash_key" ON "acceso_fan"("sesionHash");
CREATE INDEX "acceso_fan_tenantId_email_creadoEn_idx" ON "acceso_fan"("tenantId", "email", "creadoEn");
ALTER TABLE "acceso_fan" ADD CONSTRAINT "acceso_fan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('acceso_fan');
