-- Tienda: el arte de un producto ya vendido no se pisa. Cambiarlo crea una versión nueva del diseño
-- que apunta a la que reemplazó (reemplazaAId); los pedidos viejos conservan la suya (renglón).
ALTER TABLE "tienda_diseno" ADD COLUMN "reemplazaAId" UUID;
ALTER TABLE "tienda_diseno" ADD CONSTRAINT "tienda_diseno_tenantId_reemplazaAId_fkey"
  FOREIGN KEY ("tenantId", "reemplazaAId") REFERENCES "tienda_diseno"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
