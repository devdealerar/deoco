-- Del NÚCLEO: dentro de conStaff() (verificado y auditado) el staff lee los datos básicos de las
-- bandas (nombre, slug), p. ej. desde pantallas de módulos del back office. Solo lectura.
-- Reemplaza la política que había entrado junto con la tienda (20261023090000): la misma regla,
-- ahora con dueño claro. Una migración de módulo nunca toca tablas del núcleo
-- (tests/aislamiento.test.ts lo verifica).
DROP POLICY IF EXISTS lectura_staff ON "tenant";
CREATE POLICY staff_lee_tenant ON "tenant" FOR SELECT USING (app_es_staff());
