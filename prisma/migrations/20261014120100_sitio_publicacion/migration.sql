-- CreateTable
CREATE TABLE "sitio_publicacion" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contenido" JSONB NOT NULL,
    "publicadoEn" TIMESTAMP(3) NOT NULL,
    "publicadoPor" UUID,

    CONSTRAINT "sitio_publicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitio_publicacion_tenantId_key" ON "sitio_publicacion"("tenantId");


-- Aislamiento por banda.
SELECT deoco_aislar_tabla('sitio_publicacion');
