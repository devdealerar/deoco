-- AlterTable
ALTER TABLE "evento" ADD COLUMN     "claveUnica" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "evento_tenantId_nombre_claveUnica_key" ON "evento"("tenantId", "nombre", "claveUnica");

