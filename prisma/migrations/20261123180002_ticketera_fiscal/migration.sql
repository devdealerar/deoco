-- Foto fiscal de cada compra al pagarse (3.2, fiscal d1) e identificación del comprador para la
-- factura (opcional).
ALTER TABLE "ticketera_compra" ADD COLUMN "documento" TEXT;
ALTER TABLE "ticketera_compra" ADD COLUMN "fiscal" JSONB;
