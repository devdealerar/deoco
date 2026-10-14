-- Token del pedido: la página del pedido muestra el detalle y deja pagar solo con él (cookie del
-- navegador que compró, o link del mail). El id solo no alcanza.
ALTER TABLE "tienda_pedido" ADD COLUMN "token" TEXT;
UPDATE "tienda_pedido" SET "token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "tienda_pedido" ALTER COLUMN "token" SET NOT NULL;
