-- Pago: estado EN_REVISION y datos del cobro en el pedido. Deuda con el proveedor por pedido pagado.
-- AlterEnum
ALTER TYPE "TiendaEstadoPedido" ADD VALUE 'EN_REVISION';

-- AlterTable
ALTER TABLE "tienda_pedido" ADD COLUMN     "cobroId" TEXT,
ADD COLUMN     "estadoCobro" TEXT,
ADD COLUMN     "observacion" TEXT,
ADD COLUMN     "pasarela" TEXT,
ADD COLUMN     "preferenciaId" TEXT,
ADD COLUMN     "urlPago" TEXT;

-- CreateTable
CREATE TABLE "tienda_deuda" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "proveedorId" UUID NOT NULL,
    "produccion" INTEGER NOT NULL,
    "envio" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saldadaEn" TIMESTAMP(3),
    "saldadaPor" UUID,
    "notaSaldo" TEXT,

    CONSTRAINT "tienda_deuda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tienda_deuda_tenantId_proveedorId_saldadaEn_idx" ON "tienda_deuda"("tenantId", "proveedorId", "saldadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "tienda_deuda_tenantId_pedidoId_proveedorId_key" ON "tienda_deuda"("tenantId", "pedidoId", "proveedorId");

-- AddForeignKey
ALTER TABLE "tienda_deuda" ADD CONSTRAINT "tienda_deuda_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "tienda_pedido"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_deuda" ADD CONSTRAINT "tienda_deuda_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "tienda_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


SELECT deoco_aislar_tabla('tienda_deuda');
-- El staff ve las deudas de todas las bandas (back office de la tienda), solo leyendo y solo
-- dentro de conStaff() (auditado). La banda sigue viendo solo las suyas.
CREATE POLICY lectura_staff ON "tienda_deuda" FOR SELECT USING (app_es_staff());
