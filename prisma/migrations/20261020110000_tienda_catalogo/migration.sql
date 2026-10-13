-- CreateEnum
CREATE TYPE "TiendaEstadoPedido" AS ENUM ('PENDIENTE', 'PAGADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "tienda_proveedor" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contacto" TEXT NOT NULL DEFAULT '',
    "formatos" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "porDefecto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tienda_producto_base" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "fotoArchivoId" UUID,
    "fotoNombre" TEXT,
    "opciones" JSONB NOT NULL DEFAULT '[]',
    "costoProduccion" INTEGER NOT NULL,
    "costoEnvio" INTEGER NOT NULL,
    "costoEnvioPorZona" JSONB,
    "proveedorId" UUID,
    "impresionAnchoPx" INTEGER NOT NULL,
    "impresionAltoPx" INTEGER NOT NULL,
    "impresionDpi" INTEGER NOT NULL,
    "impresionFormatos" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_producto_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tienda_producto" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productoBaseId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tienda_pedido" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "estado" "TiendaEstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoEn" TIMESTAMP(3),

    CONSTRAINT "tienda_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tienda_pedido_item" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "productoBaseId" UUID NOT NULL,
    "variante" JSONB NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" INTEGER NOT NULL,
    "costoProduccion" INTEGER,
    "costoEnvio" INTEGER,
    "proveedorId" UUID,

    CONSTRAINT "tienda_pedido_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tienda_producto_tenantId_idx" ON "tienda_producto"("tenantId");

-- CreateIndex
CREATE INDEX "tienda_pedido_tenantId_estado_idx" ON "tienda_pedido"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "tienda_pedido_item_tenantId_pedidoId_idx" ON "tienda_pedido_item"("tenantId", "pedidoId");

-- AddForeignKey
ALTER TABLE "tienda_producto_base" ADD CONSTRAINT "tienda_producto_base_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "tienda_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_producto" ADD CONSTRAINT "tienda_producto_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "tienda_producto_base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "tienda_pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "tienda_producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "tienda_producto_base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un solo proveedor por defecto (el de la plataforma).
CREATE UNIQUE INDEX "tienda_proveedor_por_defecto" ON "tienda_proveedor" ("porDefecto") WHERE "porDefecto";

-- Globales: todos leen, solo el staff escribe (conStaff).
SELECT deoco_tabla_global('tienda_proveedor');
SELECT deoco_tabla_global('tienda_producto_base');

-- De banda: aisladas por tenantId.
SELECT deoco_aislar_tabla('tienda_producto');
SELECT deoco_aislar_tabla('tienda_pedido');
SELECT deoco_aislar_tabla('tienda_pedido_item');
