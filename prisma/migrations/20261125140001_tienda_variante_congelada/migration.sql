-- Lo que el fan compró queda congelado en el renglón (variante, diseño, proveedor, precio). Si el
-- staff quita una variante del producto base mientras un pedido espera el pago, el pedido se
-- paga y se produce tal cual (como con el proveedor). Al pagarse, el renglón queda marcado
-- `fueraDeCatalogo` para que el proveedor y la banda vean que es de antes del cambio.
ALTER TABLE "tienda_pedido_item" ADD COLUMN "fueraDeCatalogo" BOOLEAN NOT NULL DEFAULT false;
