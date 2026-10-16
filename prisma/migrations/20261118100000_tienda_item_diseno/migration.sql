-- Tienda: cada renglón del pedido guarda el diseño con que se compró. Cambiar el arte de un
-- producto después no cambia lo que fabrica el proveedor para los pedidos ya hechos (documento
-- maestro §7: "las órdenes ya realizadas conservan para siempre el diseño original").

ALTER TABLE "tienda_pedido_item" ADD COLUMN "disenoId" UUID;
-- Los renglones de antes: el diseño que tiene hoy su producto (lo único que hay; si la banda ya
-- lo cambió, no hay forma de saber el de antes).
UPDATE "tienda_pedido_item" i SET "disenoId" = p."disenoId"
FROM "tienda_producto" p WHERE p."tenantId" = i."tenantId" AND p."id" = i."productoId";
ALTER TABLE "tienda_pedido_item" ALTER COLUMN "disenoId" SET NOT NULL;
ALTER TABLE "tienda_pedido_item" ADD CONSTRAINT "tienda_pedido_item_tenantId_disenoId_fkey"
  FOREIGN KEY ("tenantId", "disenoId") REFERENCES "tienda_diseno"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El proveedor lee el diseño de SUS renglones (el guardado), no el que el producto tiene hoy.
DROP POLICY proveedor_lee ON "tienda_diseno";
CREATE POLICY proveedor_lee ON "tienda_diseno" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "tienda_pedido_item" i WHERE i."tenantId" = "tienda_diseno"."tenantId" AND i."disenoId" = "tienda_diseno"."id"));

-- tienda_externo_archivo (lo que el proveedor puede firmar) lee tienda_diseno con esta política:
-- queda limitada a esos mismos archivos sin tocarla.
