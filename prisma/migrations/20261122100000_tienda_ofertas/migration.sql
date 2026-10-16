-- Tienda: la banda elige el proveedor (documento maestro §7). Un producto base tiene varias
-- ofertas, una por proveedor, con su precio, su envío y su plazo; el producto de la banda guarda
-- el proveedor elegido. Reemplaza el proveedor único (o el de la plataforma) del producto base.

CREATE TABLE "tienda_oferta" (
    "id" UUID NOT NULL,
    "productoBaseId" UUID NOT NULL,
    "proveedorId" UUID NOT NULL,
    "costoProduccion" INTEGER NOT NULL,
    "costoEnvio" INTEGER NOT NULL,
    "plazoDias" INTEGER NOT NULL DEFAULT 7,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tienda_oferta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tienda_oferta_costos" CHECK ("costoProduccion" >= 0 AND "costoEnvio" >= 0 AND "plazoDias" >= 0)
);
CREATE UNIQUE INDEX "tienda_oferta_productoBaseId_proveedorId_key" ON "tienda_oferta"("productoBaseId", "proveedorId");
CREATE INDEX "tienda_oferta_proveedorId_idx" ON "tienda_oferta"("proveedorId");
ALTER TABLE "tienda_oferta" ADD CONSTRAINT "tienda_oferta_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "tienda_producto_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tienda_oferta" ADD CONSTRAINT "tienda_oferta_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "tienda_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT deoco_tabla_global('tienda_oferta');

-- Lo que había: cada producto base, una oferta con su proveedor (o el de la plataforma) y sus costos.
INSERT INTO "tienda_oferta" ("id", "productoBaseId", "proveedorId", "costoProduccion", "costoEnvio")
SELECT gen_random_uuid(), b."id", COALESCE(b."proveedorId", (SELECT p."id" FROM "tienda_proveedor" p WHERE p."porDefecto" LIMIT 1)), b."costoProduccion", b."costoEnvio"
FROM "tienda_producto_base" b
WHERE COALESCE(b."proveedorId", (SELECT p."id" FROM "tienda_proveedor" p WHERE p."porDefecto" LIMIT 1)) IS NOT NULL;

-- Cada producto de banda, el proveedor que lo producía.
ALTER TABLE "tienda_producto" ADD COLUMN "proveedorId" UUID;
UPDATE "tienda_producto" t SET "proveedorId" = o."proveedorId"
FROM "tienda_oferta" o WHERE o."productoBaseId" = t."productoBaseId";
ALTER TABLE "tienda_producto" ALTER COLUMN "proveedorId" SET NOT NULL;
ALTER TABLE "tienda_producto" ADD CONSTRAINT "tienda_producto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "tienda_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tienda_producto_base" DROP CONSTRAINT "tienda_producto_base_proveedorId_fkey";
ALTER TABLE "tienda_producto_base" DROP COLUMN "proveedorId";
ALTER TABLE "tienda_producto_base" DROP COLUMN "costoProduccion";
ALTER TABLE "tienda_producto_base" DROP COLUMN "costoEnvio";
