-- Productos de banda completos y diseños. (tienda_producto todavía no tiene filas: la tienda no estaba en uso.)
-- DropIndex
DROP INDEX "tienda_producto_tenantId_idx";

-- AlterTable
ALTER TABLE "tienda_producto" DROP COLUMN "activo",
ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "descripcion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disenoId" UUID NOT NULL,
ADD COLUMN     "fotoArchivoId" UUID,
ADD COLUMN     "fotoNombre" TEXT,
ADD COLUMN     "publicado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variantes" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "tienda_diseno" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "archivoId" UUID NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "anchoPx" INTEGER,
    "altoPx" INTEGER,
    "dpi" INTEGER,
    "anchoPt" DOUBLE PRECISION,
    "altoPt" DOUBLE PRECISION,
    "conVistaPrevia" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_diseno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tienda_diseno_tenantId_idx" ON "tienda_diseno"("tenantId");

-- CreateIndex
CREATE INDEX "tienda_producto_tenantId_publicado_idx" ON "tienda_producto"("tenantId", "publicado");

-- AddForeignKey
ALTER TABLE "tienda_producto" ADD CONSTRAINT "tienda_producto_disenoId_fkey" FOREIGN KEY ("disenoId") REFERENCES "tienda_diseno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


SELECT deoco_aislar_tabla('tienda_diseno');
