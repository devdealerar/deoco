-- Cuentas externas: un usuario que no es de ninguna banda, vinculado a algo de un módulo
-- (el proveedor de la tienda). Entra por app.<raiz>/portal/<modulo> y nunca a un panel de banda.
CREATE TABLE "cuenta_externa" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPor" UUID NOT NULL,

    CONSTRAINT "cuenta_externa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cuenta_externa_usuarioId_moduloId_key" ON "cuenta_externa"("usuarioId", "moduloId");
CREATE INDEX "cuenta_externa_moduloId_referencia_idx" ON "cuenta_externa"("moduloId", "referencia");
ALTER TABLE "cuenta_externa" ADD CONSTRAINT "cuenta_externa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Todos la leen (la app resuelve la cuenta del usuario logueado); solo el staff la escribe.
SELECT deoco_tabla_global('cuenta_externa');

-- Referencia externa de la transacción para ESE módulo, o null. La pone solo
-- conCuentaExterna() (src/nucleo/acceso/externas.ts) después de verificar la cuenta del
-- usuario. Los módulos la usan en políticas de SOLO LECTURA sobre sus tablas:
--   CREATE POLICY proveedor_lee ON tienda_orden FOR SELECT
--     USING ("proveedorId"::text = app_referencia_externa('tienda'));
CREATE FUNCTION app_referencia_externa(modulo text) RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT CASE WHEN current_setting('app.externo_modulo', true) = modulo
      THEN nullif(current_setting('app.externo_ref', true), '') END
  $$;
GRANT EXECUTE ON FUNCTION app_referencia_externa(text) TO deoco_app;
