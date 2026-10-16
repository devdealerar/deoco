-- 3.2 núcleo d6: «El titular se va de la banda → la titularidad se transfiere a otro usuario;
-- nunca queda una banda sin titular». Hasta ahora la regla estaba en el código del back office;
-- ahora la impone la base, para cualquier camino (panel, staff, una función nueva).
--
-- Disparador de restricción diferido: se mira al confirmar, así una transferencia (dar TITULAR a
-- otra persona y bajar el propio rol) entra en una transacción en cualquier orden. Si la banda ya
-- no existe (se borró entera), no hay nada que cuidar.
CREATE FUNCTION deoco_banda_con_titular() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF OLD."rol" <> 'TITULAR' THEN RETURN NULL; END IF;
  -- Bloquea la banda: dos titulares que se van a la vez no pasan juntos (el segundo espera y
  -- después ve que el primero ya no está).
  PERFORM 1 FROM "tenant" WHERE id = OLD."tenantId" FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM "membresia" WHERE "tenantId" = OLD."tenantId" AND "rol" = 'TITULAR') THEN
    RAISE EXCEPTION 'deoco:banda-sin-titular' USING HINT = 'La banda no puede quedar sin titular: pasale la titularidad a otra persona antes.';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER banda_con_titular
  AFTER UPDATE OF "rol", "tenantId" OR DELETE ON "membresia"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION deoco_banda_con_titular();

-- El equipo de la banda, para su panel: deoco_app no lee `usuario` (RLS por persona), así que el
-- nombre y el email de los miembros salen de acá, solo de la banda del pedido.
CREATE FUNCTION miembros_de_banda() RETURNS TABLE (id uuid, "usuarioId" uuid, nombre text, email text, rol text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m."id", m."usuarioId", u."nombre", u."email", m."rol" FROM "membresia" m JOIN "usuario" u ON u."id" = m."usuarioId"
    WHERE m."tenantId" = app_tenant_id()
    ORDER BY CASE m."rol" WHEN 'TITULAR' THEN 0 ELSE 1 END, u."email"
  $$;
REVOKE ALL ON FUNCTION miembros_de_banda() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION miembros_de_banda() TO deoco_app;
