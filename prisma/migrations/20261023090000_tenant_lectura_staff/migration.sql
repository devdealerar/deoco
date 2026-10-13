-- Dentro de conStaff() (verificado y auditado) el staff puede leer los datos básicos de las
-- bandas (nombre, slug) desde pantallas de módulos del back office. Solo lectura.
CREATE POLICY lectura_staff ON "tenant" FOR SELECT USING (app_es_staff());
