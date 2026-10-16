-- El renglón guarda su proveedor desde que se crea el pedido (el fan pagó el envío de ese
-- proveedor: si la banda cambia de proveedor antes del pago, el pedido sigue yendo a él). Hasta
-- ahora el proveedor recién se escribía al pagarse, y la política del portal del proveedor se
-- apoyaba en eso: ahora pide además los costos fijados, que se escriben solo al pagarse. Un
-- proveedor nunca ve un pedido sin pagar.
DROP POLICY proveedor_lee ON "tienda_pedido_item";
CREATE POLICY proveedor_lee ON "tienda_pedido_item" FOR SELECT
  USING ("proveedorId"::text = app_referencia_externa('tienda') AND "costoProduccion" IS NOT NULL);
