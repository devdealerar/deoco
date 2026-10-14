-- Limpieza de correos ya enviados (src/nucleo/correo/limpieza.ts, una vez por día desde el
-- barrido). Cruza bandas: SECURITY DEFINER, devuelve solo cuántas filas tocó. Solo ENVIADO:
-- lo PENDIENTE, ENVIANDO o FALLIDO (sin resolver) no se toca nunca.
CREATE FUNCTION limpiar_correos(p_adjuntos timestamp, p_cuerpo timestamp, p_borrar timestamp, p_tanda integer)
  RETURNS TABLE (adjuntos integer, cuerpos integer, borrados integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  -- 1. Adjuntos (QR, imágenes): el mail ya salió; lo que importa se ve en la página de la compra.
  WITH t AS (
    SELECT id FROM correo
    WHERE estado = 'ENVIADO' AND "enviadoEn" < p_adjuntos AND adjuntos <> '[]'::jsonb
    LIMIT p_tanda FOR UPDATE SKIP LOCKED
  )
  UPDATE correo c SET adjuntos = '[]'::jsonb FROM t WHERE c.id = t.id;
  GET DIAGNOSTICS adjuntos = ROW_COUNT;
  -- 2. Cuerpo: quedan para quién, qué asunto, cuándo y estado.
  WITH t AS (
    SELECT id FROM correo
    WHERE estado = 'ENVIADO' AND "enviadoEn" < p_cuerpo AND (html <> '' OR texto <> '')
    LIMIT p_tanda FOR UPDATE SKIP LOCKED
  )
  UPDATE correo c SET html = '', texto = '', adjuntos = '[]'::jsonb FROM t WHERE c.id = t.id;
  GET DIAGNOSTICS cuerpos = ROW_COUNT;
  -- 3. La fila entera.
  WITH t AS (
    SELECT id FROM correo WHERE estado = 'ENVIADO' AND "enviadoEn" < p_borrar
    LIMIT p_tanda FOR UPDATE SKIP LOCKED
  )
  DELETE FROM correo c USING t WHERE c.id = t.id;
  GET DIAGNOSTICS borrados = ROW_COUNT;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION limpiar_correos(timestamp, timestamp, timestamp, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION limpiar_correos(timestamp, timestamp, timestamp, integer) TO deoco_app;
CREATE INDEX "correo_enviado_idx" ON "correo"("enviadoEn") WHERE estado = 'ENVIADO';
