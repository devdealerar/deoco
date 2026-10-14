-- Ticketera: cuándo se publicó cada show. Si la banda baja de plan y queda por encima del tope
-- de shows publicados, se despublica lo último publicado (nunca se borra).
ALTER TABLE "ticketera_evento" ADD COLUMN "publicadoEn" TIMESTAMP(3);
UPDATE "ticketera_evento" SET "publicadoEn" = "actualizadoEn" WHERE "publicado";
