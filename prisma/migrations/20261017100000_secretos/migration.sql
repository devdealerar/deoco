-- CreateTable
CREATE TABLE "secreto" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "cifrado" BYTEA NOT NULL,
    "pista" TEXT NOT NULL DEFAULT '',
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoPor" UUID NOT NULL,

    CONSTRAINT "secreto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secreto_tenantId_moduloId_clave_key" ON "secreto"("tenantId", "moduloId", "clave");

-- AddForeignKey
ALTER TABLE "secreto" ADD CONSTRAINT "secreto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Secretos por banda: RLS como toda tabla con datos de banda.
SELECT deoco_aislar_tabla('secreto');
