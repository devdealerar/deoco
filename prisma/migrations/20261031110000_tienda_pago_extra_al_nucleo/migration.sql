-- Los pagos duplicados de la tienda pasan a la tabla del núcleo (cobro_duplicado, la de todo
-- módulo que cobra). La referencia es el pedido, como en el cobro.
SELECT deoco_importar_cobro_duplicado("tenantId", 'tienda', "pedidoId"::text, "pasarela", "cobroId", "monto", "moneda", "creadoEn")
FROM "tienda_pago_extra";

DROP TABLE "tienda_pago_extra";
