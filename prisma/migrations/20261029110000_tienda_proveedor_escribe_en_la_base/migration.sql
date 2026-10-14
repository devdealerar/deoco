-- El proveedor escribe en la banda con la base como límite (conCuentaExternaEnBanda), no con un
-- filtro del código: solo SUS órdenes y SUS deudas, solo las columnas de despachar y de saldar.

-- Contacto de la banda copiado en la orden al pagarse (el proveedor no lee miembros de la banda).
ALTER TABLE "tienda_orden" ADD COLUMN "contactoNombre" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tienda_orden" ADD COLUMN "contactoEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tienda_orden" ADD COLUMN "contactoTelefono" TEXT NOT NULL DEFAULT '';
UPDATE "tienda_orden" o SET
  "contactoNombre" = coalesce(nullif(c."contactoNombre", ''), o."bandaNombre"),
  "contactoEmail" = coalesce(nullif(c."contactoEmail", ''), (
    SELECT u."email" FROM "membresia" m JOIN "usuario" u ON u."id" = m."usuarioId"
    WHERE m."tenantId" = o."tenantId" AND m."rol" = 'TITULAR' ORDER BY m."id" LIMIT 1), ''),
  "contactoTelefono" = coalesce(c."contactoTelefono", '')
FROM (SELECT o2."id", c2."contactoNombre", c2."contactoEmail", c2."contactoTelefono"
      FROM "tienda_orden" o2 LEFT JOIN "tienda_config" c2 ON c2."tenantId" = o2."tenantId") c
WHERE c."id" = o."id";

-- Qué ve de una banda la cuenta externa de la tienda (lo usa app_externo_permite del núcleo).
-- Corren con RLS: el proveedor solo ve sus órdenes y los diseños de sus renglones.
CREATE FUNCTION tienda_externo_banda(banda uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (SELECT 1 FROM "tienda_orden" WHERE "tenantId" = banda) $$;
CREATE FUNCTION tienda_externo_archivo(archivo uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT EXISTS (SELECT 1 FROM "tienda_diseno" WHERE "archivoId" = archivo AND "tenantId" = app_externo_tenant()) $$;
GRANT EXECUTE ON FUNCTION tienda_externo_banda(uuid) TO deoco_app;
GRANT EXECUTE ON FUNCTION tienda_externo_archivo(uuid) TO deoco_app;

-- Escribir: solo sus filas, en la banda de la transacción.
CREATE POLICY proveedor_actualiza ON "tienda_orden" FOR UPDATE
  USING ("proveedorId"::text = app_referencia_externa('tienda') AND "tenantId" = app_externo_tenant())
  WITH CHECK ("proveedorId"::text = app_referencia_externa('tienda') AND "tenantId" = app_externo_tenant());
CREATE POLICY proveedor_actualiza ON "tienda_deuda" FOR UPDATE
  USING ("proveedorId"::text = app_referencia_externa('tienda') AND "tenantId" = app_externo_tenant())
  WITH CHECK ("proveedorId"::text = app_referencia_externa('tienda') AND "tenantId" = app_externo_tenant());

-- Y solo estas columnas, con estas transiciones (lo demás de la fila no lo toca).
CREATE FUNCTION tienda_proveedor_solo_despacha() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE permitidas text[] := ARRAY['estado', 'seguimiento', 'despachadoEn', 'despachadoPor'];
  BEGIN
    IF app_referencia_externa('tienda') IS NULL THEN RETURN NEW; END IF;
    IF (to_jsonb(NEW) - permitidas) IS DISTINCT FROM (to_jsonb(OLD) - permitidas) THEN
      RAISE EXCEPTION 'El proveedor solo puede despachar la orden (estado, seguimiento).';
    END IF;
    IF NOT (OLD."estado" = 'EN_PRODUCCION' AND NEW."estado" = 'DESPACHADO' AND NEW."despachadoPor" = app_externo_usuario()) THEN
      RAISE EXCEPTION 'La orden solo pasa de EN_PRODUCCION a DESPACHADO, a nombre de quien la despacha.';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER proveedor_solo_despacha BEFORE UPDATE ON "tienda_orden"
  FOR EACH ROW EXECUTE FUNCTION tienda_proveedor_solo_despacha();

CREATE FUNCTION tienda_proveedor_solo_salda() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE permitidas text[] := ARRAY['saldadaEn', 'saldadaPor', 'notaSaldo'];
  BEGIN
    IF app_referencia_externa('tienda') IS NULL THEN RETURN NEW; END IF;
    IF (to_jsonb(NEW) - permitidas) IS DISTINCT FROM (to_jsonb(OLD) - permitidas) THEN
      RAISE EXCEPTION 'El proveedor solo puede marcar la deuda saldada.';
    END IF;
    IF NOT (OLD."saldadaEn" IS NULL AND NEW."saldadaEn" IS NOT NULL AND NEW."saldadaPor" = app_externo_usuario()) THEN
      RAISE EXCEPTION 'Una deuda se marca saldada una vez, a nombre de quien la salda.';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER proveedor_solo_salda BEFORE UPDATE ON "tienda_deuda"
  FOR EACH ROW EXECUTE FUNCTION tienda_proveedor_solo_salda();

-- El pedido pasa a DESPACHADO cuando salen todas sus órdenes. Lo hace la base (como dueña): el
-- proveedor no escribe pedidos.
CREATE FUNCTION tienda_pedido_despachado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW."estado" = 'DESPACHADO' AND OLD."estado" IS DISTINCT FROM 'DESPACHADO' AND NOT EXISTS (
      SELECT 1 FROM "tienda_orden" o
      WHERE o."tenantId" = NEW."tenantId" AND o."pedidoId" = NEW."pedidoId" AND o."estado" = 'EN_PRODUCCION'
    ) THEN
      UPDATE "tienda_pedido" SET "estado" = 'DESPACHADO'
      WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."pedidoId" AND "estado" = 'PAGADO';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER pedido_despachado AFTER UPDATE ON "tienda_orden"
  FOR EACH ROW EXECUTE FUNCTION tienda_pedido_despachado();
