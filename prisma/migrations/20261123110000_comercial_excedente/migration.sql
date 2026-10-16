-- Excedente (3.2, núcleo d5): si el plan nuevo no alcanza para algo que está abierto (un show
-- con entradas vendidas, pedidos sin despachar…), el módulo sigue prendido y mientras tanto se
-- cobra el precio del plan que lo incluye. Al cerrarse, vuelve el precio del plan elegido.
ALTER TABLE "comercial_cuenta" ADD COLUMN "excedenteDesde" TIMESTAMP(3);
ALTER TABLE "comercial_cuenta" ADD COLUMN "excedentePlanId" TEXT;
