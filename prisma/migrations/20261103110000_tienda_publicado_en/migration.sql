-- Tienda: cuándo se publicó cada producto. Si la banda baja de plan y queda por encima del tope
-- de productos publicados, se despublica lo último publicado (nunca se borra).
ALTER TABLE "tienda_producto" ADD COLUMN "publicadoEn" TIMESTAMP(3);
UPDATE "tienda_producto" SET "publicadoEn" = "actualizadoEn" WHERE "publicado";
