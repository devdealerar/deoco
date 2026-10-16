-- Suplantación segura (D3; documento maestro "Suplantación segura"; 3.2 backline d6: "soporte
-- necesita entrar al panel → requiere motivo registrado; la sesión queda auditada"). El staff ya
-- no entra a cualquier panel cuando quiere: pide una sesión de soporte con un motivo escrito, que
-- vence sola, con permisos recortados (como GESTOR: nada de plata ni del control de la cuenta).
-- La banda la ve (aviso mientras dura, historial en Actividad).
CREATE TABLE "sesion_soporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "terminadaEn" TIMESTAMP(3),
    CONSTRAINT "sesion_soporte_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sesion_soporte_motivo" CHECK (length(trim("motivo")) >= 10),
    -- Como mucho una hora: si hace falta más, se pide otra (con su motivo).
    CONSTRAINT "sesion_soporte_duracion" CHECK ("venceEn" > "creadaEn" AND "venceEn" <= "creadaEn" + interval '61 minutes')
);
CREATE INDEX "sesion_soporte_tenantId_staffId_idx" ON "sesion_soporte"("tenantId", "staffId", "venceEn");
ALTER TABLE "sesion_soporte" ADD CONSTRAINT "sesion_soporte_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('sesion_soporte');
-- Se crea y se termina; nunca se borra ni se cambia el motivo o quién (queda para la banda).
REVOKE DELETE ON "sesion_soporte" FROM deoco_app;
CREATE FUNCTION deoco_sesion_soporte_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."motivo" <> OLD."motivo" OR NEW."staffId" <> OLD."staffId" OR NEW."tenantId" <> OLD."tenantId" OR NEW."creadaEn" <> OLD."creadaEn" OR NEW."venceEn" > OLD."venceEn" THEN
    RAISE EXCEPTION 'deoco:sesion-soporte-inmutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sesion_soporte_inmutable BEFORE UPDATE ON "sesion_soporte" FOR EACH ROW EXECUTE FUNCTION deoco_sesion_soporte_inmutable();
