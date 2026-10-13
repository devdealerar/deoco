-- Panel del proveedor: orden de producción por (pedido, proveedor), despacho con seguimiento,
-- y lectura entre bandas para la cuenta externa del proveedor (app_referencia_externa).

ALTER TYPE "TiendaEstadoPedido" ADD VALUE 'DESPACHADO';

CREATE TYPE "TiendaEstadoOrden" AS ENUM ('EN_PRODUCCION', 'DESPACHADO');

CREATE TABLE "tienda_orden" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "proveedorId" UUID NOT NULL,
    "bandaNombre" TEXT NOT NULL,
    "estado" "TiendaEstadoOrden" NOT NULL DEFAULT 'EN_PRODUCCION',
    "seguimiento" TEXT,
    "despachadoEn" TIMESTAMP(3),
    "despachadoPor" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tienda_orden_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tienda_orden_tenantId_pedidoId_proveedorId_key" ON "tienda_orden"("tenantId", "pedidoId", "proveedorId");
CREATE INDEX "tienda_orden_proveedorId_estado_idx" ON "tienda_orden"("proveedorId", "estado");
ALTER TABLE "tienda_orden" ADD CONSTRAINT "tienda_orden_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "tienda_pedido"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tienda_orden" ADD CONSTRAINT "tienda_orden_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "tienda_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los pedidos ya pagados tienen su deuda por proveedor: esa es su orden.
INSERT INTO "tienda_orden" ("id", "tenantId", "pedidoId", "proveedorId", "bandaNombre", "creadoEn")
SELECT gen_random_uuid(), d."tenantId", d."pedidoId", d."proveedorId", t."nombre", d."creadoEn"
FROM "tienda_deuda" d JOIN "tenant" t ON t."id" = d."tenantId";

CREATE INDEX "tienda_deuda_proveedorId_idx" ON "tienda_deuda"("proveedorId");
CREATE INDEX "tienda_pedido_item_proveedorId_idx" ON "tienda_pedido_item"("proveedorId");

SELECT deoco_aislar_tabla('tienda_orden');

-- Lectura del proveedor (cuenta externa de la tienda), en todas las bandas, SOLO lo suyo.
-- Solo SELECT: lo que escribe (despacho, saldo) va por conTenant de la banda de la orden,
-- con el proveedor en el WHERE.
CREATE POLICY proveedor_lee ON "tienda_orden" FOR SELECT
  USING ("proveedorId"::text = app_referencia_externa('tienda'));
CREATE POLICY proveedor_lee ON "tienda_deuda" FOR SELECT
  USING ("proveedorId"::text = app_referencia_externa('tienda'));
CREATE POLICY proveedor_lee ON "tienda_pedido_item" FOR SELECT
  USING ("proveedorId"::text = app_referencia_externa('tienda'));
CREATE POLICY proveedor_lee ON "tienda_pedido" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "tienda_orden" o WHERE o."tenantId" = "tienda_pedido"."tenantId" AND o."pedidoId" = "tienda_pedido"."id"));
CREATE POLICY proveedor_lee ON "tienda_producto" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "tienda_pedido_item" i WHERE i."tenantId" = "tienda_producto"."tenantId" AND i."productoId" = "tienda_producto"."id"));
CREATE POLICY proveedor_lee ON "tienda_diseno" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "tienda_producto" p WHERE p."tenantId" = "tienda_diseno"."tenantId" AND p."disenoId" = "tienda_diseno"."id"));
CREATE POLICY proveedor_lee ON "tienda_config" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "tienda_orden" o WHERE o."tenantId" = "tienda_config"."tenantId"));
