-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "limiteAlmacenamiento" BIGINT;

-- CreateTable
CREATE TABLE "archivo" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "variantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archivo_tenantId_moduloId_idx" ON "archivo"("tenantId", "moduloId");

-- AddForeignKey
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Aislamiento por banda.
SELECT deoco_aislar_tabla('archivo');
