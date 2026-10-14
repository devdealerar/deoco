-- Gestor de cuenta (src/nucleo/cuenta): topes por banda de los límites que declaran los
-- módulos, y cambios automáticos (sin una persona) en la auditoría.

CREATE TABLE "limite_banda" (
    "tenantId" UUID NOT NULL,
    "limite" TEXT NOT NULL,
    "maximo" INTEGER NOT NULL,
    CONSTRAINT "limite_banda_pkey" PRIMARY KEY ("tenantId", "limite"),
    CONSTRAINT "limite_banda_maximo_check" CHECK ("maximo" >= 0)
);
ALTER TABLE "limite_banda" ADD CONSTRAINT "limite_banda_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('limite_banda');

-- Lo que cambia la plataforma sola (un pago, una mora vencida) no tiene usuario: usuarioId null
-- y `detalle.por` dice qué módulo lo hizo.
ALTER TABLE "auditoria" ALTER COLUMN "usuarioId" DROP NOT NULL;
