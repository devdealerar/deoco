-- Lo que el staff cambia en un producto base llega a los productos de las bandas (auditoría 3.2,
-- §5.13). Antes, un arte que ya no alcanzaba la nueva resolución seguía publicado y una variante
-- que el base ya no tiene se seguía vendiendo.
--
-- - Variantes: cada producto se queda con la intersección (en el orden del base). Si quitaron XL,
--   el producto sigue con S, M y L. Lo mismo que `validarVariantes`, sin los errores.
-- - Si una opción queda sin valores, o el arte no cumple lo nuevo (formato, píxeles, dpi, tamaño
--   del PDF; lo mismo que `problemasDeImpresion`), el producto se DESPUBLICA y queda marcado
--   (`revisarDesde`): la banda ve por qué y lo arregla. Lo ya pagado no cambia (el renglón guarda
--   su variante y su diseño).
ALTER TABLE "tienda_producto" ADD COLUMN "revisarDesde" TIMESTAMP(3);

-- Cruza bandas: SECURITY DEFINER, y solo en una transacción del staff (conStaff). Devuelve cuántos
-- productos despublicó.
CREATE FUNCTION tienda_base_cambiada(p_base uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  b "tienda_producto_base"%ROWTYPE;
  n integer;
BEGIN
  IF NOT app_es_staff() THEN RAISE EXCEPTION 'deoco:solo-staff'; END IF;
  SELECT * INTO b FROM "tienda_producto_base" WHERE id = p_base;
  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE "tienda_producto" p SET "variantes" = (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nombre', bo.o->>'nombre',
      'valores', (
        SELECT COALESCE(jsonb_agg(to_jsonb(bv.v) ORDER BY bv.i), '[]'::jsonb)
        FROM jsonb_array_elements_text(bo.o->'valores') WITH ORDINALITY AS bv(v, i)
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(p."variantes") po, jsonb_array_elements_text(po->'valores') pv
          WHERE po->>'nombre' = bo.o->>'nombre' AND pv = bv.v
        )
      )
    ) ORDER BY bo.i), '[]'::jsonb)
    FROM jsonb_array_elements(b."opciones") WITH ORDINALITY AS bo(o, i)
  )
  WHERE p."productoBaseId" = p_base;

  UPDATE "tienda_producto" p SET "publicado" = false, "publicadoEn" = NULL, "revisarDesde" = COALESCE(p."revisarDesde", now())
  FROM "tienda_diseno" d
  WHERE p."productoBaseId" = p_base AND d.id = p."disenoId" AND d."tenantId" = p."tenantId"
    AND p."revisarDesde" IS NULL
    AND (
      EXISTS (SELECT 1 FROM jsonb_array_elements(p."variantes") po WHERE jsonb_array_length(po->'valores') = 0)
      OR NOT (d."formato" = ANY (b."impresionFormatos"))
      OR (d."formato" = 'png' AND (d."anchoPx" < b."impresionAnchoPx" OR d."altoPx" < b."impresionAltoPx" OR d."dpi" IS NULL OR d."dpi" < b."impresionDpi"))
      OR (d."formato" = 'pdf' AND (d."anchoPt" / 72 < b."impresionAnchoPx"::float / b."impresionDpi" * 0.99
                                OR d."altoPt" / 72 < b."impresionAltoPx"::float / b."impresionDpi" * 0.99))
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION tienda_base_cambiada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tienda_base_cambiada(uuid) TO deoco_app;
