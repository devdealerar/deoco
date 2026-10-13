-- deoco_aislar_tabla(tabla): deja una tabla de módulo aislada por banda en una línea.
-- Cada migración que crea una tabla de módulo termina con:
--   SELECT deoco_aislar_tabla('sitio_perfil');
-- Activa RLS, crea la política estándar por "tenantId" (la misma que las tablas del
-- núcleo) y da los permisos de datos a deoco_app. La tabla tiene que tener "tenantId".
-- Corre con el rol de las migraciones (dueño de la tabla); la app no puede llamarla.
CREATE FUNCTION deoco_aislar_tabla(tabla regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = tabla AND attname = 'tenantId' AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'La tabla % no tiene columna "tenantId"', tabla;
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format(
      'CREATE POLICY aislamiento_tenant ON %s USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id())',
      tabla
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO deoco_app', tabla);
  END
  $$;
REVOKE ALL ON FUNCTION deoco_aislar_tabla(regclass) FROM PUBLIC;
