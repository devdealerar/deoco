-- Archivos: de qué recurso del módulo es cada uno ("diseno" de la tienda, "logo" del sitio…). En el
-- panel, un archivo se entrega con el permiso de su recurso (lo declara el módulo en `archivos`),
-- no a cualquier miembro de la banda que tenga el id. Sin recurso: solo el titular.
ALTER TABLE "archivo" ADD COLUMN "recurso" TEXT;

-- Los que ya existían: lo que se puede deducir de las tablas de los módulos que los usan. Es una
-- lectura de una sola vez (cada tabla, si está instalada); de acá en adelante el recurso lo pone
-- quien guarda. Lo que no se deduce queda sin recurso: solo el titular lo ve en el panel.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('tienda', 'tienda_diseno', 'archivoId', 'diseno'),
    ('tienda', 'tienda_producto', 'fotoArchivoId', 'foto-producto'),
    ('sitio', 'sitio_perfil', 'logoArchivoId', 'logo'),
    ('sitio', 'sitio_perfil', 'fondoArchivoId', 'fondo'),
    ('sitio', 'sitio_perfil', 'riderArchivoId', 'rider'),
    ('sitio', 'sitio_slide', 'archivoId', 'slide'),
    ('sitio', 'sitio_descargable', 'archivoId', 'descargable'),
    ('ticketera', 'ticketera_evento', 'fotoArchivoId', 'foto-show')
  ) AS t(modulo, tabla, columna, recurso) LOOP
    IF to_regclass(format('%I', r.tabla)) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE "archivo" a SET "recurso" = %L FROM %I x WHERE a."recurso" IS NULL AND a."moduloId" = %L AND x."tenantId" = a."tenantId" AND x.%I = a."id"',
        r.recurso, r.tabla, r.modulo, r.columna);
    END IF;
  END LOOP;
END
$$;
