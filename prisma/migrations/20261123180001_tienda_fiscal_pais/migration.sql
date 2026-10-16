-- Desde la primera venta (3.2): el país de destino de cada pedido (multipaís d4: después no se
-- puede reconstruir) y la foto fiscal de la venta (fiscal d1). Hoy solo se envía en Argentina.
ALTER TABLE "tienda_pedido" ADD COLUMN "pais" TEXT NOT NULL DEFAULT 'AR';
ALTER TABLE "tienda_pedido" ADD CONSTRAINT "tienda_pedido_pais" CHECK ("pais" ~ '^[A-Z]{2}$');
-- Identificación del comprador para la factura (DNI o CUIT), opcional.
ALTER TABLE "tienda_pedido" ADD COLUMN "documento" TEXT;
-- Foto fiscal al pagarse: vendedor (condición, CUIT), comprador, renglones e impuestos.
ALTER TABLE "tienda_pedido" ADD COLUMN "fiscal" JSONB;
ALTER TABLE "tienda_orden" ADD COLUMN "pais" TEXT NOT NULL DEFAULT 'AR';
