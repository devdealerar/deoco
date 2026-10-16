Documento maestro — Deoko

## 1. Propósito y modelo de producto

Deoko es una plataforma modular para bandas. Cada banda cuenta con un sitio propio, una identidad visual propia y un panel de administración. La plataforma debe permitir incorporar funcionalidades de forma progresiva sin reconstruir lo ya hecho.

El primer módulo funcional será el **Press Kit de banda**. Tienda on demand, ticketing, proveedores, soporte y la central de eventos se conectarán después al mismo núcleo común.

## 2. Núcleo común y arquitectura modular

Antes de desarrollar módulos específicos, Deoko necesita una base compartida para:

- Bandas, sitios y dominios.
- Usuarios, roles y permisos.
- Suscripciones, planes y facturación de la plataforma.
- Auditoría de acciones.
- Notificaciones y soporte.

Cada módulo debe conectarse a este núcleo, pero poder desarrollarse y activarse por etapas.

Antes de comenzar el desarrollo, un agente de Claude deberá revisar esta arquitectura y las decisiones de este documento para detectar dependencias, riesgos, omisiones u oportunidades de mejora.

## 3. Suscripción, brief y creación inicial del sitio

1. La banda paga su suscripción.
2. Es derivada automáticamente a un brief guiado.
3. Deoko solicita la información necesaria para armar su identidad visual y contenido inicial.
4. A partir del brief se genera una única propuesta inicial de skin para el sitio y press kit.
5. No hay rondas de cambios ni revisión manual de diseño por parte de Deoko.
6. La banda recibe una plataforma ya armada y luego la personaliza desde su panel.

La skin inicial es un punto de partida. La banda puede modificar colores, imágenes, textos, orden de secciones y contenidos sin volver a crear su sitio.

## 4. Sitios de bandas y editor

Los sitios usan plantillas flexibles con identidad visual de cada banda. La banda podrá editar el contenido sin usar código.

### Navegación y bloques reordenables

Habrá arrastrar y soltar para:

- Reordenar las pestañas o secciones principales, como Press Kit, Tienda, Ticketing y Contacto.
- Reordenar los bloques dentro de cada sección; por ejemplo, mover YouTube por encima de Spotify dentro del Press Kit.

El menú será dinámico: una banda solo verá públicamente los módulos que tenga activados. Cuando active Tienda o Ticketing, podrá agregarlos y ubicarlos donde quiera.

La definición detallada de qué bloques contiene cada sección se resolverá con Claude. Por ahora queda definido que serán bloques predefinidos, editables y reordenables.

### Publicación

Los cambios se editan en borrador, se previsualizan y luego se publican. Esto evita que los visitantes vean un sitio incompleto o cambios accidentales.

### Marca Deoko

Todos los sitios mostrarán una mención discreta “Powered by Deoko” en el pie de página, con enlace a la página pública de Deoko.

### Dominios

Deoko dará una dirección inicial dentro de la plataforma. La banda podrá conectar un dominio propio posteriormente.

Deoko no revenderá dominios en la primera etapa. Registrarlos y administrarlos agregaría renovaciones, vencimientos, cobros, transferencias y soporte. Se ofrecerá una guía para conectar un dominio que la banda ya tenga o compre por su cuenta.

### Idiomas

La estructura debe estar preparada para múltiples idiomas desde el inicio, sin que esto obligue a lanzarlos todos de inmediato. Cada banda podrá activar los idiomas que necesite y editar sus propios textos traducidos. La estructura, skin y módulos se mantienen compartidos.

## 5. Press Kit profesional

El Press Kit no será solamente una sección visual. Permitirá una versión pública viva y una versión estática exportable en PDF.

También podrá incluir archivos descargables por separado, como fotos en alta resolución, logos, rider técnico, stage plot y one-sheet. La banda podrá compartir un enlace privado con prensa, productores o contratantes.

El detalle final de contenidos y bloques será definido con Claude.

## 6. Calendario de fechas y central de eventos

La banda carga cada fecha una vez y esa información alimenta automáticamente su sitio: fecha, ciudad, sala y enlace de entradas cuando corresponda.

Deoko tendrá una central pública de eventos. No publica eventos propios ni interviene editorialmente: refleja de forma automática los eventos públicos creados por las bandas.

El fan descubre el evento en Deoko, pero al querer comprar es redirigido al evento y la experiencia de venta de la banda. Cada banda conserva autoría, control y venta de su fecha.

## 7. Tienda on demand y proveedores

La tienda será 100% on demand. No habrá stock propio de bandas dentro del modelo estándar.

La banda elige proveedores, personaliza productos base y publica productos terminados con su propia identidad. El fan compra productos ya diseñados por la banda; no personaliza la prenda.

### Panel de proveedor

Cada proveedor tendrá un panel en Deoko para administrar:

- Catálogo de productos base.
- Variantes, precios de producción, tiempos y zonas de cobertura.
- Técnicas disponibles y requisitos de archivos.
- Órdenes, estados, seguimiento e incidencias.

Deoko tendrá una administración central para aprobar y auditar proveedores y productos.

### Flujo de producto

1. La banda conecta o habilita un proveedor.
2. Ve el catálogo base de ese proveedor dentro de su panel.
3. Elige un producto y crea una versión propia: sube arte, lo ubica en las zonas permitidas, define variantes, nombre, fotos, descripción y precio de venta.
4. Deoko valida el diseño contra las especificaciones del proveedor.
5. La banda publica el producto terminado en su tienda.

Cada producto del proveedor debe tener una ficha de personalización: áreas disponibles, medidas, colores, técnicas, límites de archivo y variantes permitidas.

### Catálogo común

Deoko usará un formato común para productos, talles, colores, técnicas, áreas de impresión, costos, tiempos y envíos. Cada proveedor mapea sus particularidades a esa estructura.

Si aparece una capacidad nueva —por ejemplo, un tipo especial de gorra o parche— se incorpora como una opción reutilizable del catálogo, no como una solución exclusiva para un proveedor.

### Proveedores integrados y manuales

Se contemplan dos formas de operar:

- **Integrado:** catálogo, órdenes y seguimiento sincronizados automáticamente.
- **Manual:** el proveedor usa su panel para recibir órdenes, descargar archivos, actualizar estados y cargar seguimiento.

Ambos usan el mismo modelo de órdenes.

### Auditoría, reputación y marketplace

Deoko debe auditar y aprobar a los proveedores antes de habilitarlos. La auditoría puede incluir muestras físicas, materiales, tiempos, capacidad de despacho, políticas de reclamo y calidad de sus procesos.

Habrá un marketplace o directorio de proveedores con perfiles que muestren productos, cobertura, plazos, información comercial y reputación. Las bandas podrán calificar y comentar solo después de órdenes reales.

Las calificaciones se separarán, por ejemplo, en calidad, cumplimiento de plazos, comunicación y resolución de problemas. Deoko moderará las reseñas.

### Banda como proveedor propio

Una banda con stock puede registrarse como proveedor propio, conectarse a su propia tienda y administrar sus productos con las mismas reglas de catálogo, envío y estados.

Al principio, ese proveedor propio puede quedar limitado a abastecer a su propia banda. Más adelante podrá ofrecer sus servicios a otras bandas si cumple los requisitos.

### Calidad, conflictos y mediación

Deoko audita el ingreso de proveedores para dar confianza inicial. En un conflicto puntual, la banda abre el reclamo directamente en el panel del proveedor, con evidencia e historial.

La banda y el proveedor intentan resolverlo primero. Si no hay acuerdo, cualquiera puede solicitar mediación de Deoko. Deoko revisa el historial completo y aplica las reglas de la plataforma. Si el proveedor no responde dentro del plazo definido, el caso puede escalar automáticamente.

### Diseños y derechos

Un cambio de diseño crea un producto nuevo. Las órdenes ya realizadas conservan para siempre el diseño original. La banda puede duplicar una configuración anterior, cambiar el arte y publicar una nueva versión.

La banda declara que tiene derecho a usar los diseños, logos, fotos y demás material que sube. El proveedor fabrica; Deoko tendrá un canal de denuncia y baja rápida para reclamos válidos.

## 8. Pagos a proveedores

El fan paga en la tienda de la banda y el dinero se acredita en la cuenta de cobro de esa banda.

El proveedor no debe financiar la producción. La orden se crea como pendiente; el proveedor cobra a la banda el costo de producción y envío mediante un medio de pago que la banda autorizó previamente. Solo con ese cobro confirmado se libera la producción.

No es una transferencia automática del pago del fan al proveedor: son dos movimientos separados sobre la cuenta o método de pago de la banda. La diferencia queda como margen de la banda.

Debe investigarse si Mercado Pago, PayPal, Stripe y las pasarelas locales de Latinoamérica permiten débitos o cobros automáticos autorizados desde la cuenta de la banda hacia el proveedor, y bajo qué condiciones. Si no lo permiten, el proveedor podrá cobrar tarjeta, débito bancario o saldo prepago de la banda.

Cada orden compartirá una referencia única entre Deoko y proveedor para asociar el cobro, producción, despacho y seguimiento.

## 9. Ticketing

Las entradas se venden exclusivamente online y generan un QR único para acceso.

### Tipos y tandas

La banda puede crear preventa, general, última tanda u otros tipos de entrada. Cada tanda tendrá precio, cupo y período de venta propios. Al agotarse o vencer una tanda, se habilita la siguiente.

### Descuentos y promotores

Los códigos de descuento reducen el precio según reglas de la banda. Los códigos de promotor permiten atribuir ventas a una persona, canal o campaña y registrar sus resultados.

### Invitados y entradas nominadas

Las listas de invitados tendrán cupos y datos de asistentes. El ingreso se registra separado de las entradas pagas.

La banda puede activar entradas nominadas por evento, solicitando nombre y documento y verificándolos en puerta junto con el QR.

### QR y acceso en puerta

Cada QR es único y firmado. Al escanearlo, se valida que sea real, pertenezca al evento y no haya sido utilizado; luego queda marcado como ingresado.

El staff usa una PWA: una web que se agrega a la pantalla de inicio y funciona como aplicación, sin necesidad de App Store. Cada integrante recibe una invitación individual y revocable, limitada al evento y a la función de escaneo. No comparte acceso administrativo ni información de pagos.

La plataforma registra quién escaneó cada entrada.

### Conectividad y contingencia

La validación normal debe ser online y en tiempo real. Deoko no opera la red del venue: el organizador debe asegurar conectividad para garantizar que un QR no se acepte dos veces.

Deoko debe mostrar el estado de conexión de los escáneres y ofrecer un checklist previo de evento. Si un dispositivo queda sin conexión, la plataforma advierte que no puede garantizar exclusividad y reconcilia los registros después.

Como contingencia, antes del evento se puede descargar una lista de acceso en la web app. El staff busca manualmente a la persona y registra su entrada con hora y responsable. Si no puede usar la app, usa una lista impresa o descargada y luego carga o reconcilia los accesos al recuperar conexión.

### Transferencias y recuperación

Cuando la banda lo permita, una entrada puede transferirse. El destinatario la acepta desde su correo, el QR original se invalida y se emite uno nuevo. También se puede reenviar una entrada perdida sin duplicarla.

### Cancelación y reprogramación

Si un evento se reprograma, las entradas siguen vigentes para la nueva fecha y puede haber devolución cuando aplique. Si se cancela, la banda puede iniciar reembolsos masivos mediante su propia pasarela de pago y el sistema actualiza el estado de las entradas.

### Reportes y demanda alta

La banda ve en tiempo real entradas vendidas, ingresos registrados y personas pendientes, diferenciando pagas, invitados y otros accesos.

En eventos con alta demanda, puede definir límite de entradas por comprador. Deoko organiza cola de espera y reserva temporalmente el cupo durante el pago; si el pago no se completa, el cupo vuelve a estar disponible.

Los mapas de sala con butacas numeradas quedan fuera de la primera etapa. Se empieza con entradas generales, cupos y QR.

## 10. Área del fan

El fan contará con un área sencilla de “Mis compras” para consultar pedidos de merchandising, estado de envío, entradas, QR y eventos próximos.

El acceso inicial puede ser mediante enlace seguro enviado por correo, sin obligar a crear una contraseña. La cuenta con contraseña podrá ser opcional más adelante. Las acciones sensibles, como transferir entradas, requieren confirmación adicional por correo.

Los datos del fan permanecen aislados por banda para proteger privacidad.

## 11. Facturación y pasarelas de cobro

La banda es responsable de facturar sus ventas al fan, porque vende desde su sitio y cobra en su propia cuenta. Deoko registra órdenes, pero no emite comprobantes en nombre propio.

La arquitectura debe incluir integraciones fiscales por país. En Argentina, una banda podrá conectar ARCA; en otros países, el sistema fiscal o proveedor equivalente. Cada banda usa sus propias credenciales y los comprobantes se emiten a su nombre.

La integración fiscal se construirá progresivamente por país y deberá validarse con asesoría contable local antes de activarse.

Cada banda conectará las pasarelas compatibles con su país usando sus propias credenciales. Deoko facilita la venta, pero no retiene fondos ni actúa como intermediario financiero.

## 12. Soporte, suplantación y auditoría

Deoko contará con un área de soporte basada en tickets. Las bandas abren consultas, adjuntan información y siguen su estado.

Los tiempos de respuesta se clasifican por severidad:

- Crítico: respuesta en una hora para checkout, sitio o escaneo caídos.
- Alto: respuesta en ocho horas.
- Normal: respuesta en 24 horas.

Habrá un modo evento: la banda informa una fecha importante, Deoko revisa previamente la configuración y prioriza soporte durante el evento.

### Suplantación segura

Un agente de soporte puede entrar temporalmente al panel de una banda para diagnosticar un problema sin conocer su contraseña. La sesión debe tener un aviso visible, permisos recortados —sin pagos ni facturación— y un registro consultable por la banda.

### Auditoría transversal

Deoko debe registrar quién hizo qué en cada espacio: publicaciones, cambios de precio, transferencias, accesos de soporte, configuraciones y reclamos. Cada banda podrá consultar movimientos relevantes de su cuenta.

## 13. Datos, comunicaciones y cumplimiento

### Newsletter

La base de contactos es de cada banda y debe poder exportarse. El newsletter requiere confirmación por correo, baja en un clic y registro de consentimiento. Deoko provee la herramienta; la banda es responsable del uso de su base.

### Correos desde el dominio de la banda

Cada banda podrá verificar su dominio para autorizar el envío de correos desde su propia identidad y mejorar entregabilidad. El panel debe guiar esta configuración paso a paso. Mientras tanto, se puede usar un remitente temporal.

### Contenido alojado

Las bandas no subirán archivos de música ni video. Podrán insertar o enlazar Spotify y YouTube. Se permitirá una galería acotada de fotos, además de textos y diseños.

Deoko modera los contenidos que aloja —fotos, textos y diseños— y ofrece un proceso de denuncia y baja. Spotify y YouTube gestionan el contenido alojado en sus propias plataformas.

### Analítica

Las bandas podrán ver ventas, visitas, geografía de compradores, repetición de compra, crecimiento de mailing, rendimiento de productos y eventos. Un manager con varias bandas tendrá vista consolidada sin mezclar datos de fans.

### Medición de consumo

Deoko medirá por banda el uso de almacenamiento, correos, tráfico y picos de venta desde el primer día. No implica límites iniciales; permite entender costos y definir planes sostenibles más adelante.

## 14. Suspensión, retención y estado del servicio

Tras 60 días de falta de pago, el sitio puede despublicarse y bloquear nuevas ventas, pero no se borran órdenes, entradas ni registros transaccionales.

Si hay eventos futuros con entradas vendidas, el escaneo debe seguir funcionando hasta que el evento termine. La información se conserva por el plazo legal aplicable y se ofrece exportación de datos.

Deoko tendrá una página pública de estado para informar disponibilidad de plataforma, checkout, correos y escaneo, además de incidentes y mantenimientos.

## 15. Sitio de Deoko y área privada de bandas

Deoko tendrá una página pública propia para explicar el producto, planes y beneficios a las bandas. Desde allí, una banda podrá registrarse o iniciar sesión.

Luego accede a su área privada para administrar sitios, proveedores, productos, eventos, plan, facturación y soporte. La página pública de estado estará vinculada desde ese entorno y también podrá consultarse sin iniciar sesión.

## 16. Escala inicial

El escenario estimado es:

- Hasta 100 bandas en los primeros tres meses.
- Un escenario alto de hasta 300 bandas.
- Eventos de aproximadamente 20 a 500 asistentes.

La infraestructura inicial debe ser simple pero escalable, especialmente para picos concentrados de venta y escaneo. No se necesita una operación masiva desde el primer día, pero sí capacidad de ampliarse sin rediseñar la plataforma.
