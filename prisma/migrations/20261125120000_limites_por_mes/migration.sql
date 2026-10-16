-- Topes del 3.2 (núcleo d2: "lo que separa un plan de otro son los límites de productos,
-- imágenes y eventos") y el excedente (d5/d6):
-- - "eventos por mes": antes se contaban los shows publicados a la vez; ahora, los publicados con
--   fecha en cada mes calendario (`ticketera.shows-por-mes`).
-- - imágenes del sitio (`sitio.imagenes`): tope nuevo.
-- - entradas vendidas por mes (`ticketera.entradas-por-mes`): SOLO MIDE. Nunca corta una venta;
--   el excedente se muestra en Plan y pago con el plan o el complemento que lo cubre.
-- - `limite_extra`: lo que suma un complemento suelto (un mes, un período) a un tope.

CREATE TABLE "limite_extra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "limite" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    -- Quién lo dio: "<modulo>:<referencia>" (p. ej. el cobro del complemento). Único: idempotente.
    "origen" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "limite_extra_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "limite_extra_cantidad" CHECK ("cantidad" > 0),
    CONSTRAINT "limite_extra_periodo" CHECK ("desde" < "hasta")
);
CREATE UNIQUE INDEX "limite_extra_origen_key" ON "limite_extra"("tenantId", "origen");
CREATE INDEX "limite_extra_tenantId_limite_idx" ON "limite_extra"("tenantId", "limite");
ALTER TABLE "limite_extra" ADD CONSTRAINT "limite_extra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('limite_extra');

-- Los topes ya aplicados a cada banda: el de shows cambia de nombre (mismo número, ahora por mes).
UPDATE "limite_banda" SET "limite" = 'ticketera.shows-por-mes' WHERE "limite" = 'ticketera.shows-publicados';
