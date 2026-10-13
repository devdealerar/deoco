-- Checkout: datos del fan y totales en el pedido; precio y envío copiados en cada renglón.
-- Claves foráneas compuestas (tenantId, …): la base no deja mezclar bandas entre pedido,
-- renglón, producto y diseño (una clave foránea simple no mira RLS).
-- tienda_pedido todavía no tiene filas: la tienda no vendía.

-- DropForeignKey
ALTER TABLE "tienda_pedido_item" DROP CONSTRAINT "tienda_pedido_item_pedidoId_fkey";

-- DropForeignKey
ALTER TABLE "tienda_pedido_item" DROP CONSTRAINT "tienda_pedido_item_productoId_fkey";

-- DropForeignKey
ALTER TABLE "tienda_producto" DROP CONSTRAINT "tienda_producto_disenoId_fkey";

-- AlterTable
ALTER TABLE "tienda_pedido" ADD COLUMN     "calle" TEXT NOT NULL,
ADD COLUMN     "ciudad" TEXT NOT NULL,
ADD COLUMN     "codigoPostal" TEXT NOT NULL,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "envio" INTEGER NOT NULL,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "numero" TEXT NOT NULL,
ADD COLUMN     "piso" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "provincia" TEXT NOT NULL,
ADD COLUMN     "subtotal" INTEGER NOT NULL,
ADD COLUMN     "telefono" TEXT NOT NULL,
ADD COLUMN     "total" INTEGER NOT NULL,
ADD COLUMN     "zonaEnvio" TEXT;

-- AlterTable
ALTER TABLE "tienda_pedido_item" ADD COLUMN     "envioUnitario" INTEGER NOT NULL,
ADD COLUMN     "nombreProducto" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tienda_diseno_tenantId_id_key" ON "tienda_diseno"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tienda_pedido_tenantId_id_key" ON "tienda_pedido"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tienda_producto_tenantId_id_key" ON "tienda_producto"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "tienda_producto" ADD CONSTRAINT "tienda_producto_tenantId_disenoId_fkey" FOREIGN KEY ("tenantId", "disenoId") REFERENCES "tienda_diseno"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "tienda_pedido"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "tienda_producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

