-- Manda el 3.2 (proveedor d5): si un proveedor deja de ofrecer un producto base (o el staff
-- desactiva el producto base), los productos que lo usan se DESPUBLICAN: vender algo que nadie
-- va a producir es peor que perder la venta. Lo ya pagado se produce igual (el renglón copió
-- proveedor y costos). La banda ve la marca y, si hay otra oferta, reasigna en un clic.
ALTER TABLE "tienda_producto" ADD COLUMN "sinOfertaDesde" TIMESTAMP(3);

-- Cruza bandas: SECURITY DEFINER, y solo en una transacción del staff (conStaff). Devuelve
-- cuántos productos despublicó. `p_proveedor` null: todos los de ese producto base.
CREATE FUNCTION tienda_retirar_oferta(p_base uuid, p_proveedor uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  n integer;
BEGIN
  IF NOT app_es_staff() THEN RAISE EXCEPTION 'deoco:solo-staff'; END IF;
  UPDATE "tienda_producto" SET "publicado" = false, "publicadoEn" = NULL, "sinOfertaDesde" = COALESCE("sinOfertaDesde", now())
  WHERE "productoBaseId" = p_base AND (p_proveedor IS NULL OR "proveedorId" = p_proveedor)
    AND "sinOfertaDesde" IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION tienda_retirar_oferta(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tienda_retirar_oferta(uuid, uuid) TO deoco_app;
