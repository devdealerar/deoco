-- D4: la casilla "quiero recibir novedades" del checkout (aparte y sin marcar). Al pagarse, el
-- módulo fans pide la confirmación por mail (doble confirmación).
ALTER TABLE "tienda_pedido" ADD COLUMN "novedades" BOOLEAN NOT NULL DEFAULT false;
