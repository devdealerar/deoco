-- Eventos fallidos del back office (/admin/eventos): se cuentan y se listan de a 50, los
-- más recientes primero, entre TODOS los eventos de todas las bandas. Sin este índice,
-- contarlos recorre la tabla `evento` entera, que solo crece. Parcial: los fallidos son
-- pocos, así que el índice queda chico aunque la tabla tenga millones de filas.
CREATE INDEX "evento_fallido" ON "evento" ("fecha" DESC, "id" DESC) WHERE "estado" = 'FALLIDO';
