-- Dominios propios detrás de Cloudflare (docs/diseno-dominios.md §7): la verificación, el
-- principal y la revisión periódica dejan de mirar el registro A y leen el estado que informa
-- Cloudflare (custom hostname para "conectar por CNAME", zona para "delegar").

-- Qué estaba mal: "no apunta" pasa a "problema", con el texto que ve la banda.
ALTER TABLE "dominio" RENAME COLUMN "noApuntaDesde" TO "problemaDesde";
ALTER TABLE "dominio" ADD COLUMN "problema" TEXT;

-- Por dónde llega a Deoco (null: el subdominio de la plataforma) y lo que dijo Cloudflare.
ALTER TABLE "dominio" ADD COLUMN "via" TEXT CONSTRAINT "dominio_via" CHECK ("via" IN ('cname', 'zona'));
ALTER TABLE "dominio" ADD COLUMN "proveedorId" TEXT;
ALTER TABLE "dominio" ADD COLUMN "estadoProveedor" TEXT;
ALTER TABLE "dominio" ADD COLUMN "certificado" TEXT;
ALTER TABLE "dominio" ADD COLUMN "validacion" JSONB NOT NULL DEFAULT '[]';

-- ¿Otra fila (de cualquier banda) tiene el mismo dominio? Sin verificar, un dominio puede estar
-- en varias bandas y comparten el custom hostname de Cloudflare: al quitarlo de una, no se
-- borra si otra lo sigue usando. Solo un sí o un no.
CREATE FUNCTION dominio_compartido(p_dominio text, p_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (SELECT 1 FROM "dominio" WHERE "dominio" = p_dominio AND "id" <> p_id)
  $$;
REVOKE ALL ON FUNCTION dominio_compartido(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dominio_compartido(text, uuid) TO deoco_app;
