-- Aislamiento por tenant con Row Level Security.
-- Requiere que exista el rol deoco_app (prisma/sql/crear-rol-app.sql).
--
-- La variable de sesión app.tenant_id la fija conTenant() con set_config(..., true),
-- o sea local a la transacción. Si no está fijada, la expresión da NULL y la
-- política no deja pasar ninguna fila: una consulta sin tenant no ve nada.
-- (NULLIF cubre el caso en que la variable quedó en '' tras una transacción previa.)

CREATE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Permisos del rol de la aplicación: datos sí, estructura no.
GRANT USAGE ON SCHEMA public TO deoco_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "usuario", "tenant", "membresia", "dominio", "moduloTenant", "evento" TO deoco_app;
GRANT EXECUTE ON FUNCTION app_tenant_id() TO deoco_app;
-- Las tablas que creen migraciones futuras (de módulos) heredan los mismos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deoco_app;

-- tenant: la banda es su propio tenant.
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_tenant ON "tenant"
  USING ("id" = app_tenant_id())
  WITH CHECK ("id" = app_tenant_id());

ALTER TABLE "membresia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_tenant ON "membresia"
  USING ("tenantId" = app_tenant_id())
  WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "dominio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_tenant ON "dominio"
  USING ("tenantId" = app_tenant_id())
  WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "moduloTenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_tenant ON "moduloTenant"
  USING ("tenantId" = app_tenant_id())
  WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "evento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_tenant ON "evento"
  USING ("tenantId" = app_tenant_id())
  WITH CHECK ("tenantId" = app_tenant_id());

-- Resolución de tenant por host. Es el único punto donde se busca en `dominio`
-- sin tenant fijado (todavía no se sabe cuál es). SECURITY DEFINER corre como el
-- dueño de la tabla y devuelve SOLO el id del tenant, nada más de la fila.
CREATE FUNCTION resolver_tenant_por_host(host text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT "tenantId" FROM "dominio" WHERE "dominio" = lower(host) LIMIT 1 $$;
REVOKE ALL ON FUNCTION resolver_tenant_por_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_tenant_por_host(text) TO deoco_app;

-- Un solo dominio principal por banda.
CREATE UNIQUE INDEX "dominio_principal_unico" ON "dominio" ("tenantId") WHERE "esPrincipal";
