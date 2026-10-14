-- La ticketera anotaba los pagos duplicados como texto en `observacion`:
--   "Pago duplicado: ARS 15000.00 (cobro 123). Devolvelo desde tu pasarela."
-- Pasan a la tabla del núcleo (cobro_duplicado), como los de cualquier módulo que cobra, y el
-- texto sale de la observación (queda solo lo de EN_REVISION, si había).
SELECT deoco_importar_cobro_duplicado(
  c."tenantId", 'ticketera', c."id"::text, coalesce(c."pasarela", 'mercadopago'), m[3],
  round(m[2]::numeric * 100)::integer, m[1], c."creadoEn")
FROM "ticketera_compra" c,
  LATERAL regexp_matches(c."observacion", 'Pago duplicado: ([A-Z]{3}) ([0-9]+\.[0-9]{2}) \(cobro ([^)]+)\)\. Devolvelo desde tu pasarela\.', 'g') AS m
WHERE c."observacion" LIKE '%Pago duplicado:%';

UPDATE "ticketera_compra"
SET "observacion" = NULLIF(btrim(regexp_replace("observacion", '\s*Pago duplicado: [A-Z]{3} [0-9]+\.[0-9]{2} \(cobro [^)]+\)\. Devolvelo desde tu pasarela\.', '', 'g')), '')
WHERE "observacion" LIKE '%Pago duplicado:%';
