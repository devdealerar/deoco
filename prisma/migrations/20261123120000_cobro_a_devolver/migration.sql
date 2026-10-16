-- `cobro_duplicado` pasa a ser la lista de PAGOS PARA DEVOLVER de cada banda: un pago duplicado,
-- uno que llegó cuando lo comprado ya había vencido, o uno que no coincide con lo que se cobraba.
-- La plata está en la cuenta de la banda; la devuelve la banda (desde Deoco, con su propia
-- cuenta, o por su lado). Deoco solo lleva la lista: nunca toca el dinero.
ALTER TABLE "cobro_duplicado" ADD COLUMN "motivo" TEXT NOT NULL DEFAULT 'duplicado';
ALTER TABLE "cobro_duplicado" ADD CONSTRAINT "cobro_duplicado_motivo" CHECK ("motivo" IN ('duplicado', 'tardio', 'no-coincide'));
ALTER TABLE "cobro_duplicado" ADD COLUMN "detalle" TEXT;
-- Resuelto: devuelto desde Deoco (devolucionId), o marcado a mano por la banda, o la pasarela
-- avisó que se devolvió.
ALTER TABLE "cobro_duplicado" ADD COLUMN "devueltoEn" TIMESTAMP(3);
ALTER TABLE "cobro_duplicado" ADD COLUMN "devueltoPor" UUID;
ALTER TABLE "cobro_duplicado" ADD COLUMN "devolucionId" TEXT;
ALTER TABLE "cobro_duplicado" ADD COLUMN "nota" TEXT;
CREATE INDEX "cobro_duplicado_pendientes_idx" ON "cobro_duplicado"("tenantId", "moduloId") WHERE "devueltoEn" IS NULL;
