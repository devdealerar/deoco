-- Envío por proveedor (desglose en el pedido), pagos duplicados y contacto de la tienda.
-- AlterTable
ALTER TABLE "tienda_pedido" ADD COLUMN     "envios" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "tienda_pago_extra" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "pasarela" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_pago_extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tienda_config" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contactoNombre" TEXT NOT NULL DEFAULT '',
    "contactoEmail" TEXT NOT NULL DEFAULT '',
    "contactoTelefono" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "tienda_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tienda_pago_extra_tenantId_pedidoId_idx" ON "tienda_pago_extra"("tenantId", "pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "tienda_pago_extra_tenantId_pasarela_cobroId_key" ON "tienda_pago_extra"("tenantId", "pasarela", "cobroId");

-- CreateIndex
CREATE UNIQUE INDEX "tienda_config_tenantId_key" ON "tienda_config"("tenantId");

-- AddForeignKey
ALTER TABLE "tienda_pago_extra" ADD CONSTRAINT "tienda_pago_extra_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "tienda_pedido"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


SELECT deoco_aislar_tabla('tienda_pago_extra');
SELECT deoco_aislar_tabla('tienda_config');
