-- Escalera de la cuota impaga (documento maestro §14 y 3.2): dos escalones nuevos entre MOROSO y
-- SUSPENDIDO. MOROSO_GRAVE: aviso permanente en el panel. SOLO_LECTURA: el panel no guarda nada;
-- el sitio y las ventas siguen.
ALTER TYPE "EstadoTenant" ADD VALUE 'MOROSO_GRAVE' AFTER 'MOROSO';
ALTER TYPE "EstadoTenant" ADD VALUE 'SOLO_LECTURA' AFTER 'MOROSO_GRAVE';
