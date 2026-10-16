-- D4: la casilla "quiero recibir novedades" de la compra de entradas (aparte y sin marcar).
ALTER TABLE "ticketera_compra" ADD COLUMN "novedades" BOOLEAN NOT NULL DEFAULT false;
