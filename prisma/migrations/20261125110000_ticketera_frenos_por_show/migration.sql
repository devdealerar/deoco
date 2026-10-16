-- Frenos contra el acaparamiento configurables por show (decisión del bloque D): una banda grande
-- quiere otros números. Vacío = los de la plataforma (10 min, 6 por compra, 12 por persona, 2
-- reservas abiertas por email, 4 por IP). La base acota cada uno: ningún show queda sin freno.
ALTER TABLE "ticketera_evento"
  ADD COLUMN "reservaMinutos" INTEGER,
  ADD COLUMN "maxPorCompra" INTEGER,
  ADD COLUMN "maxPorPersona" INTEGER,
  ADD COLUMN "reservasPorEmail" INTEGER,
  ADD COLUMN "reservasPorIp" INTEGER,
  ADD CONSTRAINT "ticketera_evento_frenos" CHECK (
    ("reservaMinutos" IS NULL OR "reservaMinutos" BETWEEN 5 AND 30)
    AND ("maxPorCompra" IS NULL OR "maxPorCompra" BETWEEN 1 AND 20)
    AND ("maxPorPersona" IS NULL OR "maxPorPersona" BETWEEN 1 AND 100)
    AND ("reservasPorEmail" IS NULL OR "reservasPorEmail" BETWEEN 1 AND 5)
    AND ("reservasPorIp" IS NULL OR "reservasPorIp" BETWEEN 1 AND 50)
  );
