-- Devolución o contracargo de una compra pagada: queda DEVUELTA y sus entradas dejan de valer.
ALTER TYPE "TicketeraEstadoCompra" ADD VALUE 'DEVUELTA';
