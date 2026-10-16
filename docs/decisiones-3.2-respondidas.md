# Decisiones del mapa 3.2 — respuestas

Fuente: documento 3.2 «Mapa de decisiones del ecosistema», septiembre 2026.
La respuesta de cada decisión es la opción que el documento marca como recomendada,
según la instrucción del titular de aceptar todas las recomendaciones.
Las que dicen SIN RECOMENDACIÓN siguen abiertas y las decide el titular.


## Reglas transversales

Antes de entrar módulo por módulo hay reglas que atraviesan todo el sistema. Se definen una sola
vez y condicionan cada decisión posterior. Si una decisión cómoda viola una de estas reglas, se
cae la decisión, no la regla.

### td1 · ¿Se ratifica que el dinero de las ventas nunca pase por Deoco?

Es la regla de la que se derivan el crédito con proveedor, el descarte del marketplace y la
mitad del diseño de ticketing. Cambiarla obliga a rediscutir tres módulos.

**RESPUESTA: Sí. Es la regla rectora y no se toca.**
Queda cerrada y condiciona todo lo demás.

Descartadas:
- Sí, pero quiero reevaluarla cuando haya volumen. — Se marca para revisión en la fase 4.
- No. Quiero evaluar el marketplace con reparto automático. — Reabre el diseño de comercio, ticketing y flujo de fondos.

### td2 · ¿Cuál es la unidad de cuenta de la plataforma?

Hoy es la banda. Un inversor va a señalar que las bandas se disuelven y que eso produce una baja
estructural que no depende de la satisfacción del cliente.

**RESPUESTA: El músico, que conserva su cuenta aunque cambie de proyecto.**
Es barato hoy y muy caro dentro de dos años. Cambia el modelo de datos del núcleo.

Descartadas:
- La banda, como está hoy. — Más simple de construir. Baja estructural cuando el proyecto se disuelve.
- La banda ahora, con el modelo preparado para migrar al músico. — Compromiso: no cambia el alcance de la fase 1 pero condiciona el esquema.

### td3 · ¿Qué reglas se consideran inviolables para el equipo de desarrollo?

Las marcadas acá pasan al archivo de protocolo del agente: si una implementación necesita violar
una, no se implementa y se avisa.

**RESPUESTA (varias):**
- El dinero no pasa por Deoco.
- Aislamiento por banda impuesto en el motor de base de datos.
- Los datos son de la banda, con exportación siempre disponible.
- Registro de actividad obligatorio.

No elegidas:
- Sin atajos para la banda piloto.


## Núcleo Deoco (`nucleo`, etapa 1)

Primera propuesta de segmentación. Reemplaza la decisión anterior de un plan único, con una
salvedad: conviene lanzar con dos niveles, no con cuatro. GIRA y SELLO se abren cuando haya
clientes pidiéndolos, no antes.

### d1 · Planes y cuotas comerciales · El costo no fija el precio

La infraestructura cuesta entre uno y dos dólares por banda por mes. Es irrelevante frente a
cualquier precio de venta razonable, así que el precio lo fija la disposición a pagar del
mercado, no el costo. La relación entre niveles debería acercarse a 1 / 3 / 7.

Opciones del listado:
- El límite real de capacidad no es el servidor: son las horas de soporte. El precio tiene que estar calculado contra eso.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Planes y cuotas comerciales · De dónde salen las cuotas de almacenamiento

No son números redondos elegidos al azar: equivalen a unos siete años de consumo de una banda
que use su plan al máximo, según el cálculo de la sección 29. Funcionan como red de seguridad
frente a un uso anómalo, no como diferencial de venta.

Opciones del listado:
- Lo que efectivamente separa un plan de otro son los límites de productos, imágenes y eventos. El almacenamiento nunca se alcanza antes que ellos.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Arquitectura · Restricción técnica inviolable

Todas las bandas comparten base de datos, pero el aislamiento se impone en el motor mediante
seguridad a nivel de fila, no por disciplina del código de aplicación. Ninguna consulta puede
devolver datos de otra banda aunque el código contenga un error. Es la primera regla que
verifican las pruebas automáticas y la que ningún cambio puede relajar.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · Alta y generación del sitio · Riesgo asumido

La identidad visual es el punto de mayor sensibilidad del cliente. Por eso el sistema selecciona
entre plantillas curadas en lugar de generar diseño libre: el resultado es acotado y predecible,
y la percepción es de elección propia y no de imposición. Si esta hipótesis falla en las
primeras bandas, el modelo de operación completo se encarece.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d5 · Cuotas y aislamiento de recursos · Regla que no se negocia

Las entradas y el almacenamiento no bloquean en duro durante una operación en curso. Si una
banda llega al tope en el minuto ocho de una preventa, cortar la venta le arruina el show y
convierte un problema de facturación en un problema comercial irreversible. Se permite el
excedente, se avisa y se factura después.

Opciones del listado:
- El bloqueo duro sirve para publicar un producto nuevo o sumar un idioma. Nunca para interrumpir una venta.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d6 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Llega al tope de entradas con la venta abierta → Nunca se corta la venta: se permite el excedente y se factura o se sugiere subir de plan
- Llega al tope de almacenamiento → Se bloquean cargas nuevas; no se borra ni se despublica nada
- Baja de plan con más productos que el nuevo tope → Los excedentes se despublican por orden inverso de creación; no se eliminan
- Baja de plan con dominio propio activo → El dominio deja de servirse y vuelve el subdominio; el dominio sigue siendo de la banda
- Sube de plan a mitad de período → Se cobra la diferencia proporcional y los límites se amplían de inmediato
- Un evento puntual excede el plan → Complemento suelto en lugar de cambio de plan
- El titular se va de la banda → La titularidad se transfiere a otro usuario; nunca queda una banda sin titular
- Conflicto interno por el control de la cuenta → Deoco no arbitra disputas entre integrantes; el titular registrado conserva el control
- Se revoca un usuario con sesión abierta → La sesión se invalida en el siguiente movimiento, no al vencimiento
- Un manager pierde la representación → La banda revoca el acceso desde su panel; los datos quedan en la banda

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Sitio público y press kit (`sitio`, etapa 2)

Plantillas flexibles con la identidad de cada banda, editables por bloques sin intervención
técnica.

### d1 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- El dominio propio queda mal configurado → El subdominio de Deoco sigue activo y sirviendo el sitio; no hay caída
- El certificado del dominio no se emite → Reintento automático; el sitio se sirve por el subdominio mientras tanto
- Una imagen no cumple la medida → Se recorta según el punto focal detectado; no se deforma ni se publica rota
- Un idioma queda sin traducir → Se muestra el contenido del idioma principal en lugar de dejar vacío
- Un embebido deja de estar disponible → El bloque se oculta en el sitio público en lugar de mostrar un error
- Llega spam por el formulario de contacto → Filtro y límite de envíos por origen; nada se pierde, queda clasificado

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Panel de la banda (`panel`, etapa 2)

Panel de la banda

### d1 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Dos personas editan el mismo bloque → Bloqueo de edición mientras otra sesión lo tiene abierto
- Se supera el límite de almacenamiento → No se borra nada; se bloquean cargas nuevas hasta liberar espacio o ampliar
- Se supera el cupo de envíos de newsletter → El envío queda programado para el siguiente período o se ofrece ampliación

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Panel del manager y plan Sello (`manager`, etapa 2)

Entorno para representantes con varios artistas a cargo. Es un producto comercializable de forma
independiente.

### d1 · Panel del manager · Límite

La vista consolidada expone métricas agregadas pero nunca unifica bases de fans. Los datos de
compradores permanecen aislados por banda, incluso bajo un mismo manager.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Una banda del roster deja de pagar → Se suspende esa banda; el resto del roster no se ve afectado
- Quiere exportar datos del roster → Exporta métricas agregadas; los datos de fans requieren autorización de cada banda
- La banda revoca el acceso del manager → El acceso cesa de inmediato; nada de lo creado por el manager se elimina

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Público y área del fan (`publico`, etapa 2)

Sin registro obligatorio ni contraseña. El acceso se resuelve por enlace de un solo uso enviado
al correo de la compra. Los datos del comprador quedan aislados por banda. Una misma persona que
compra en dos bandas distintas genera dos registros independientes, sin correlación entre ellos.

### d1 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- El enlace de acceso venció → Se emite uno nuevo al mismo correo; el anterior deja de funcionar
- Se equivocó al escribir el correo → Solo la banda puede corregirlo, con verificación del comprobante de pago
- No recibió el correo de la compra → Reenvío disponible desde la página de confirmación y desde el sitio
- Transfiere y el destinatario no acepta → La transferencia caduca y la entrada vuelve al emisor intacta
- Pide la baja de sus datos → Se anonimiza el registro conservando la orden por obligación legal

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Organizador de lanzamiento (`lanzamiento`, etapa 2)

Un lanzamiento implica cerca de veinte tareas con dependencias temporales y una lista larga de
piezas gráficas en formatos distintos. Hoy se gestiona en notas dispersas, y el incumplimiento
de un plazo compromete toda la cadena. Es una herramienta interna del panel, sin expresión en el
sitio público. Se crea una campaña por lanzamiento y el sistema deriva la lista de entregables y
el cronograma.

### d1 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Se mueve la fecha de lanzamiento → Todos los hitos se recalculan manteniendo las distancias relativas
- La fecha está a menos de 30 días → Los hitos vencidos se muestran como atrasados, no se ocultan
- Un hito vence sin cumplirse → Queda marcado como atrasado y aparece en el inicio del panel
- Una pieza no cumple la medida → Se acepta pero se marca como no conforme; no se bloquea la campaña
- Cambian las medidas de una plataforma → Se actualiza el contenido normativo desde el back office, sin tocar código
- La campaña se cancela → Se archiva sin borrar; los archivos siguen en la biblioteca

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Tienda y producción bajo demanda (`tienda`, etapa 3)

Producción bajo demanda en su totalidad, sin stock propio de la banda en el modelo estándar. El
fan adquiere un producto ya diseñado; no personaliza la prenda.

### d1 · Tienda on demand · Donde está el valor

La mayoría de los conflictos en producción bajo demanda se origina en archivos de baja
resolución o mal posicionados. Bloquearlos antes de que lleguen al proveedor resuelve el
problema real de ambas partes y sostiene la reputación del directorio.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Tienda on demand · Límite de la mediación

La decisión de Deoco constituye una política de plataforma y no un arbitraje vinculante. Su
sanción máxima es la suspensión del directorio. Debe quedar explícito en el contrato con
proveedores.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Devoluciones y contracargos · Política

En producción bajo demanda no se admite devolución por arrepentimiento: el artículo se fabrica
para un comprador determinado. Se acepta reclamo únicamente por defecto de fabricación o error
de despacho, y la reimpresión corre por cuenta del proveedor.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- El arte no llega a la resolución mínima → Se bloquea la publicación del producto, no solo se advierte
- El arte excede el área de impresión → Se reencuadra dentro del área permitida o se rechaza si pierde contenido
- Una variante queda sin stock en el proveedor → Se oculta esa variante del selector sin despublicar el producto
- La banda fija un precio menor al costo → Se permite, pero se advierte con el margen negativo calculado
- Se denuncia el diseño por derechos de terceros → Baja preventiva del producto y notificación con plazo de descargo
- El fan compra a dos proveedores en una orden → La orden se divide en envíos independientes con plazos propios
- Dirección fuera de zona de cobertura → El checkout no permite completar la compra con esa dirección
- Dirección inválida o incompleta → Validación al ingresarla, no al despachar
- El paquete se pierde en tránsito → Reclamo al transportista por el proveedor; reimpresión o reembolso según resultado
- El fan no retira y el envío vuelve → Se ofrece reenvío con costo a cargo del comprador, o reembolso menos el envío

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Red de proveedores y directorios (`proveedor`, etapa 3)

Un proveedor opera en modo integrado, con catálogo y órdenes sincronizados por sistema, o en
modo manual, trabajando desde este panel. Ambos usan el mismo modelo de órdenes y los mismos
estados. Una banda con stock propio puede registrarse como proveedor de sí misma bajo las mismas
reglas, y eventualmente ofrecer servicio a terceros si cumple los requisitos de ingreso.

### d1 · Directorios y vitrinas · Decisión

Servicios creativos y venues operan como vitrina pura. Deoco no cobra comisión, no negocia
condiciones y no interviene en el acuerdo. Cobrar por ese contacto reintroduciría a Deoco en el
flujo de fondos y reabriría la exposición legal que el modelo entero está diseñado para evitar.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Directorios y vitrinas · Distinción que habilita todo esto

Cobrar una comisión sobre la venta mete a Deoco en el flujo de fondos entre banda y proveedor.
Cobrar una suscripción por usar la plataforma no lo hace: es una factura directa de Deoco al
participante por un servicio prestado, separada por completo de la transacción. La primera
contradice el principio rector; la segunda es compatible con él.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Directorios y vitrinas · Hipótesis a validar

Los venues consolidados tienen agenda cubierta y poco incentivo para figurar. El público
objetivo real son las salas en formación y las que necesitan llenar fechas de semana. La
contrapartida que ofrece Deoco es visibilidad asociada a eventos que ya venden entradas en la
plataforma, sin costo. Si esa contrapartida no alcanza, el directorio queda vacío y no vale
construirlo.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · Directorios y vitrinas · Descartado

Cobrar por contacto derivado a los creativos. Crea el incentivo de inflar contactos y mete
fricción exactamente donde conviene que no haya ninguna.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d5 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- No toma una orden en plazo → Escalamiento automático a Deoco y aviso a la banda; impacta en su reputación
- Discontinúa un producto base ya publicado → Se bloquea la venta de nuevas unidades; las órdenes vigentes se respetan o se cancelan con reembolso
- Cambia el costo de producción → El nuevo costo rige para órdenes futuras; nunca para órdenes ya cobradas al fan
- El proveedor cierra o se da de baja → Sus productos se despublican; las órdenes en curso se completan o se reembolsan
- Acumula reclamos por calidad → Revisión de Deoco y suspensión del directorio si corresponde
- Un perfil queda inactivo o no responde → Se despublica tras un período sin actividad ni respuesta
- Reseñas sin trabajo realizado → La calificación requiere un trabajo declarado por ambas partes
- Conflicto con un creativo o venue → Deoco no media: es vitrina, no intermediario
- Un evento de la central resulta falso → Baja inmediata y revisión de la banda que lo publicó
- El venue no respeta lo publicado → Se registra el reporte y afecta su permanencia en el directorio

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Dinero, precios y liquidación (`dinero`, etapa 3)

Deoco factura exclusivamente por suscripción. No percibe comisión sobre venta de merchandising
ni de entradas, y no participa del flujo de fondos entre banda, fan y proveedor. Esta
restricción determina el resto de la arquitectura comercial: descarta el esquema de marketplace
con división automática de pagos, obliga al sistema de crédito con proveedor de la sección 15, y
asigna a la banda la responsabilidad fiscal y legal de cada venta.

### d1 · Modelo de negocio · Principio rector

El dinero de las ventas no pasa por Deoco en ningún momento. El fan paga a la banda, la banda
cobra en su propia pasarela y liquida al proveedor desde la plataforma. Deoco coordina la
operación; no la financia ni la intermedia.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Flujo de fondos · Titularidad del saldo

El crédito representa dinero que la banda ya transfirió al proveedor. Deoco lo muestra y lo
descuenta, sin custodiarlo. En interfaz aparece siempre atado al proveedor —«Crédito con
[proveedor]»— para que no exista ambigüedad sobre quién tiene los fondos.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Calculadora de precio y liquidación · Límite del alcance

Ninguno de estos importes pasa por Deoco. La plataforma calcula y muestra; el dinero sigue yendo
del fan a la pasarela de la banda. La calculadora es una herramienta de información, no una
operación financiera, y esa distinción tiene que quedar explícita en la interfaz.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · Calculadora de precio y liquidación · Cómo se presenta

Siempre como estimación, nunca como importe garantizado. El número definitivo lo determina la
pasarela al acreditar. La interfaz dice explícitamente que el arancel lo fija la pasarela y que
Deoco solo lo refleja.

Opciones del listado:
- La orden guarda el arancel vigente al momento de la venta, de modo que el histórico siga siendo consistente aunque la tabla cambie después.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d5 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Cambio de precio del plan → Se respeta el precio vigente hasta el vencimiento del período contratado
- Baja voluntaria a mitad de período → El servicio continúa hasta el fin del período pagado; no hay reintegro proporcional
- Se agotan los créditos de un servicio pago → La función se bloquea sin afectar ninguna otra parte del producto
- No hay crédito suficiente al entrar la orden → La orden queda retenida; no se envía al proveedor ni se cancela de inmediato
- Vence el plazo sin financiar → Cancelación automática y reembolso íntegro al fan desde la pasarela de la banda
- El pago se acredita pero no llega la notificación → Conciliación periódica contra la pasarela; la orden se completa sin intervención
- Pago duplicado del fan → Se detecta por referencia de orden y se reembolsa el excedente
- Contracargo después de producir → Impacta en la cuenta de la banda; Deoco lo refleja pero no interviene en la disputa
- Carga crédito y el proveedor no lo valida → El saldo no se acredita hasta la validación; hay plazo máximo y escalamiento a Deoco
- Queda saldo sin usar y la banda se va → El saldo es del proveedor; la devolución se acuerda entre banda y proveedor

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Ticketing y app de puerta (`ticketing`, etapa 4)

Venta exclusivamente en línea con emisión de código único por entrada. El dimensionamiento
previsto es de veinte a quinientos asistentes por evento, lo que reduce sustancialmente la
exigencia de concurrencia. Preventa, general, última tanda o los que la banda defina. Cada tanda
con precio, cupo y período propios; al agotarse o vencer se habilita la siguiente.

### d1 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Se cancela el evento → Reembolso masivo iniciado por la banda; todas las entradas pasan a anuladas
- Se reprograma el evento → Las entradas siguen vigentes; se habilita ventana de devolución para quien no pueda ir
- Dos compradores toman el último cupo → El cupo se reserva al iniciar el pago; el segundo no llega a pagar
- El pago se cae a mitad del proceso → El cupo reservado se libera al vencer el plazo de reserva
- Cambia el precio entre tandas mientras compra → Rige el precio al iniciar el pago, dentro de la ventana de reserva
- Se supera el límite por comprador → Se bloquea el excedente por correo y medio de pago
- La banda necesita agregar cupo → Se amplía una tanda o se abre una nueva; no se altera lo ya vendido
- Un promotor deja de trabajar con la banda → Su código se desactiva; las ventas ya atribuidas se conservan
- QR ya utilizado → Se rechaza el ingreso y se registra el intento con hora y dispositivo
- QR de otro evento o vencido → Se rechaza sin marcar nada

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Registro de obra y marca (`obra`, etapa 4)

Tres organismos distintos, tres trámites independientes y una confusión generalizada entre
ellos. Es el punto donde más dinero pierden las bandas por desconocimiento, y donde Deoco puede
aportar valor sin asumir riesgo financiero.

### d1 · Registro de obra y marca · Alcance

Deoco no ejecuta trámites ante organismos públicos ni actúa como gestoría. Orienta, prepara
documentación, genera los entregables técnicos que cada organismo exige y lleva el estado de
avance. La presentación la realiza la banda.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Registro de obra y marca · Servicio pago — transcripción asistida

La banda carga una grabación, incluso de teléfono. El sistema devuelve la transcripción de
melodía con cifrado en el formato requerido y la letra transcrita en hoja aparte, ambas
descargables y editables antes de presentar.

Opciones del listado:
- Se comercializa por paquete de créditos, fuera del plan base, porque tiene costo variable por unidad procesada. El resultado siempre requiere revisión humana: se presenta como borrador técnico, nunca como documento definitivo.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- El nombre ya está registrado por otro → Se informa el titular y la clase; no se sugiere continuar igual
- La consulta del organismo no responde → Se informa que el dato no pudo verificarse; nunca se afirma disponibilidad sin confirmar
- La transcripción sale con errores → Se entrega como borrador editable; no se presenta como documento final
- El audio es inaudible o muy ruidoso → Se rechaza antes de consumir crédito
- La obra tiene varios autores → Se registran porcentajes de participación; la suma debe cerrar en cien
- Cambian requisitos o aranceles → Se actualiza el contenido normativo desde el back office
- La banda pide que Deoco presente el trámite → Fuera de alcance; se deriva a gestoría externa

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Facturación fiscal (`fiscal`, etapa 6)

La banda es responsable de facturar sus ventas al comprador, dado que vende desde su sitio y
cobra en su propia cuenta. Deoco registra las operaciones pero no emite comprobantes en nombre
propio.

### d1 · Facturación fiscal · Requisito desde el primer día

Aunque la facturación no esté activa, cada orden debe registrar condición fiscal del vendedor,
identificación tributaria del comprador y desglose impositivo. Sin esos campos capturados desde
el origen, el día que se active la integración no habrá forma de facturar operaciones
anteriores.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- La banda no está formalizada → Se emite comprobante no fiscal; la facturación queda desactivada
- El organismo rechaza el comprobante → Reintento automático; la venta no se bloquea por un fallo de facturación
- Vencen las credenciales fiscales → Los comprobantes quedan en cola hasta renovarlas; nada se pierde
- El comprador pide factura después → Se emite con fecha de emisión, sobre los datos ya capturados
- Se reembolsa una venta ya facturada → Se emite la nota de crédito correspondiente

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Backline y sostenimiento (`backline`, etapa 1)

Área de soporte basada en tickets, con severidad diferenciada en lugar de un plazo de respuesta
único.

### d1 · Morosidad, corte y retención · Excepción inviolable

Si existen eventos futuros con entradas vendidas, el escaneo permanece operativo hasta la
finalización del evento. Interrumpirlo perjudicaría a compradores ajenos a la deuda y
trasladaría el problema legal a Deoco.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Backline — el área · La decisión que hace que el área funcione

El soporte es trabajo por interrupción, y el trabajo por interrupción siempre desplaza al
trabajo programado. Si las mismas personas hacen soporte y laboratorio sin separación
estructural, el laboratorio no existe. No se arregla con disciplina: se arregla con diseño.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Ciberseguridad: alcance y límites · Advertencia previa

Hablar de «ciberseguridad» con dos personas puede generar una falsa sensación de cobertura. Lo
que dos personas sostienen es higiene y automatización, no vigilancia continua. Hay que escribir
explícitamente qué no cubre el área y comprarlo afuera, o el equipo va a creerse protegido donde
no lo está.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · Dotación y costo · Dos a medio tiempo antes que una completa

Con el mismo costo se resuelven tres cosas: habilita la rotación entre guardia y bloque
protegido, elimina el riesgo de que el área entera sea el conocimiento de una sola cabeza, y da
cobertura ante enfermedad o vacaciones.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d5 · Dotación y costo · Lo que dice esta tabla

El soporte crece con los clientes; el mantenimiento no. Duplicar las bandas no duplica el
trabajo de sostener el sistema, pero sí el de atender gente. Eso define qué conviene automatizar
primero: el alta y la autogestión, no la infraestructura.

Opciones del listado:
- El laboratorio ocupa lo que sobra. A cien bandas sobran unas 70 horas mensuales, que alcanzan. A trescientas no sobra casi nada, y ahí hay que decidir entre crecer el equipo o suspender la exploración.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d6 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Rechazo del medio de pago → Reintentos escalonados antes de considerar mora
- Mora con órdenes en producción → Las órdenes en curso se completan; se bloquean las nuevas
- Mora con evento futuro vendido → El escaneo sigue operativo hasta el cierre del evento
- Regulariza después del corte → Republicación inmediata con todo el contenido intacto
- Pide eliminación total de datos → Se elimina lo eliminable; órdenes y comprobantes se retienen por obligación legal
- Incidente crítico fuera de horario → Alerta automática al responsable de guardia; la página de estado se actualiza
- La banda clasifica mal la severidad → Deoco la reclasifica dejando constancia del criterio
- Modo evento con poca antelación → Se acepta si hay capacidad; si no, se informa antes del evento
- Soporte necesita entrar al panel → Requiere motivo registrado; la sesión queda auditada
- Mantenimiento programado → Se evita cualquier ventana con eventos activos en la plataforma

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Infraestructura y tecnología (`infra`, etapa 0)

Criterio de selección: tecnología madura y ampliamente documentada. El desarrollo se asiste con
agentes, y la calidad del resultado es proporcional a la cantidad de material de referencia
disponible sobre cada herramienta. Se evaluó Laravel como alternativa. Se optó por Next.js por
dos razones: el rendimiento requerido en los sitios públicos y la conveniencia de un único
lenguaje en todo el proyecto.

### d1 · Infraestructura y dimensionamiento · Hallazgo que cambia la grilla de planes

Ninguna banda llega al límite de almacenamiento antes de llegar al límite de productos, imágenes
o eventos. El almacenamiento no es la restricción que diferencia los planes: son los límites de
ítems.

Opciones del listado:
- Eso significa dos cosas. La cuota de GB funciona como red de seguridad frente a un uso anómalo, no como argumento de venta. Y no tiene sentido vender «más espacio» como beneficio: lo que la banda compra cuando sube de plan es poder publicar más productos y abrir más eventos.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Infraestructura y dimensionamiento · Premisa del proyecto

No se quiere sostener costo operativo de administración de servidores. Un VPS autogestionado es,
por definición, administración de servidores: parches, cortafuegos, certificados, ajuste de la
base, rotación de logs, monitoreo, copias, restauración y guardia. El proveedor responde por el
hipervisor y la red; todo lo que corre adentro es responsabilidad propia.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d3 · Infraestructura y dimensionamiento · Recomendación

Arrancar con la opción A y migrar a la C cuando el costo lo justifique. La fase 2 es la única
que tiene que salir en tres meses y el desarrollo recae sobre una persona. El camino inverso
—arrancar en VPS, apagar incendios y llegar tarde— no tiene vuelta atrás.

Opciones del listado:
- Con cien bandas, la infraestructura gestionada cuesta entre uno y dos dólares por banda por mes. Sobre un plan de veinte dólares es menos del diez por ciento del ingreso. El costo que importa optimizar no es ese: es el tiempo propio.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d4 · Infraestructura y dimensionamiento · Riesgo que los números no muestran

Un solo nodo no tiene alta disponibilidad. La severidad crítica de una hora y el modo evento en
fin de semana no son compatibles con un único servidor sin réplica: si cae un sábado a las once
de la noche con tres eventos escaneando en puerta, no hay nada que hacer más que esperar al
proveedor.

Opciones del listado:
- Las copias de seguridad no pueden vivir en ese mismo disco. Destino externo, en otro proveedor, con restauración probada. Una copia que nunca se restauró no es una copia.
- Preferir dos nodos modestos antes que uno grande. El modo de falla que puede matar el negocio no es la saturación: es la indisponibilidad.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d5 · Infraestructura y dimensionamiento · A vigilar desde el día uno

Auditoría y envíos de newsletter crecen linealmente con la actividad y pierden valor con el
tiempo. Particionadas por mes con retención automática desde el principio. Sin eso, en tres años
hay una base de veinte gigabytes de los cuales quince no sirven para nada.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d6 · Infraestructura y dimensionamiento · Letra chica

Al exceder el cupo, Hostinger no factura excedente: reduce la velocidad a 10 Mbps hasta el
siguiente ciclo. Eso no es un cargo, es una caída de servicio encubierta. Requiere alerta de
consumo al setenta por ciento.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d7 · ¿Se ratifican los casos de excepción de este módulo?

Cada situación de borde ya tiene definido el comportamiento del sistema y qué ve el usuario.
Ratificarlos cierra el alcance del módulo.

Opciones del listado:
- Se agota el disco del nodo → Se bloquean cargas nuevas; nada se borra ni se despublica
- Se alcanza el cupo de ancho de banda → Alerta al setenta por ciento y migración de estáticos al borde antes del tope
- Una banda concentra un pico de venta → Cola de espera y reserva temporal de cupo, acotadas a ese evento
- Caída del nodo durante un evento → Sin réplica no hay conmutación; la puerta pasa a lista descargada
- Corrupción de la base → Restauración desde copia externa; se prioriza órdenes y entradas

**RESPUESTA: Sí, todos.**
Pasan a la especificación como criterios de verificación.

Descartadas:
- Sí, salvo los que indico abajo. — Escribí cuáles y qué comportamiento querés en su lugar.
- Faltan casos que quiero agregar. — Escribilos abajo.


## Salida comercial (`comercial`, etapa 2)

El producto no está construido y la venta tiene que empezar igual. Eso es factible, pero solo
bajo reglas estrictas: lo que se promete mal hoy se paga con cancelaciones en el mes cuatro.

### d1 · Cómo vender lo que todavía no existe · Regla única

Se vende la fase 2 como producto terminado. Todo lo demás se cuenta como dirección del proyecto,
en futuro y sin fecha. Si el cliente dice «necesito vender entradas en marzo», la respuesta
correcta es «hoy no te lo puedo prometer». Perder esa venta cuesta mucho menos que ganarla y no
cumplir.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.

### d2 · Guión: diseñadores y creativos · Honestidad obligatoria

Al principio el directorio va a tener poco tráfico. Hay que decirlo en la primera frase.
Prometer volumen que no existe quema la relación con la comunidad creativa, que es chica y habla
entre sí. Lo que se ofrece hoy es estar entre los primeros, no facturación.

**RESPUESTA: Se ratifica tal como está.**
Queda cerrado y pasa a la especificación de construcción.

Descartadas:
- Se ratifica con un ajuste que indico abajo. — Escribí qué cambia y por qué.
- No estoy de acuerdo. Hay que rediscutirlo. — Bloquea lo que dependa de esta definición hasta resolverlo.


## Producción multipaís (`multipais`, etapa 5)

Cuando una banda tiene público afuera, la orden se produce en el país de destino en vez de
cruzar una aduana. El enrutamiento se resuelve por la dirección de envío, nunca por la ubicación
aparente de quien navega, y cada país tiene su proveedor, su precio y su plazo.

### d1 · ¿Cómo le gira plata una banda argentina a un proveedor del exterior?

Es la pregunta que decide si este módulo existe. El crédito con proveedor funciona limpio
adentro de un país por transferencia bancaria. Cruzando la frontera aparece el control de
cambios: acceso al mercado oficial, percepciones y límites. El enrutamiento resuelve la
logística y deja el problema del dinero intacto.

Opciones del listado:
- Sin respuesta a esto, el resto del módulo no se construye
- No es una objeción de diseño: es la condición de viabilidad
- Se responde con un contador y un caso real, no con análisis

**RESPUESTA: Se averigua con el estudio contable antes de la fase 5.**
Es una de las veintitrés preguntas que ya están armadas. Hasta tener respuesta, el módulo queda diferido.

Descartadas:
- El proveedor del exterior cobra por pasarela internacional, no por transferencia. — Más simple y legal, pero se come entre tres y cinco puntos de margen en cada orden.
- Solo se habilitan países donde la banda ya tenga cuenta propia. — Elimina el problema y reduce muchísimo el alcance: sirve para bandas con estructura afuera.
- Se descarta la producción multipaís por ahora. — Se mantiene el envío internacional desde el país de origen, con el costo a la vista.

### d2 · ¿Se ratifica que el enrutamiento vaya por dirección de envío y no por ubicación aparente?

La geolocalización de quien navega es más cómoda de implementar y falla de una forma cara:
produce en un país y despacha a otro.

**RESPUESTA: Sí, siempre por dirección de envío.**
La ubicación aparente solo preselecciona moneda y catálogo.

Descartadas:
- Por ubicación aparente, con confirmación del comprador. — Más simple, y traslada el error al fan.
- El comprador elige el país explícitamente. — Sin ambigüedad, con un paso más en la compra.

### d3 · ¿Quién consigue los proveedores de cada país?

Determina si esto es una función para unas pocas bandas grandes o una capacidad de la
plataforma.

**RESPUESTA: Deoco, uno por región, disponible para todas.**
Resuelve el arranque en frío y es el único activo defendible del proyecto.

Descartadas:
- Cada banda consigue el suyo. — Sin trabajo para Deoco. Solo lo van a lograr las bandas que ya tienen equipo.
- Mixto: Deoco propone y la banda puede traer el propio. — Más flexible y más superficie de soporte.

### d4 · ¿Desde cuándo se guarda el país de destino de cada orden?

Es un campo en una tabla si se hace ahora, y un dato que no se puede reconstruir si se hace
después.

**RESPUESTA: Desde la primera venta de la fase 3, mucho antes de que exista este módulo.**
Cuesta casi nada hoy y es lo que después permite decidir con datos.

Descartadas:
- Cuando se construya la fase 5. — Se arranca sin historial y la primera decisión de apertura de país se toma a ciegas.

### d5 · ¿Qué países se evalúan primero, si la pregunta del giro se resuelve?

Marcá los que tengan sentido por tamaño de escena y por facilidad operativa. Sirve para
priorizar a quién buscar como proveedor.

**RESPUESTA: SIN RECOMENDACIÓN — queda abierta.**
Opciones disponibles:
- México — Escena grande y mucha demanda de merch.
- Chile — Cercano, operativamente simple.
- Colombia — Escena en crecimiento.
- España — Puerta de entrada a Europa y muchas bandas giran ahí.
- Estados Unidos — El mercado más grande y el más competitivo en producción.
- Brasil — Grande, y el más complejo en materia aduanera y fiscal.

### d6 · Con saldo insuficiente y dos órdenes simultáneas al mismo proveedor, ¿cuál se produce?

La reserva atómica impide el saldo negativo, pero hay que decidir qué pasa con la que no entra.
El fan ya pagó en las dos.

Opciones del listado:
- Las dos compras están cobradas: no se trata de rechazar una venta
- Se trata de en qué orden se manda a producir y qué ve el que espera

**RESPUESTA: Se produce la primera que llegó; la otra queda en espera de fondos con aviso a la banda.**
Simple, predecible y explicable al fan. La banda recibe el monto que falta.

Descartadas:
- Se produce la de menor costo, para que entren más órdenes con el saldo disponible. — Maximiza el uso del saldo y es imposible de explicar cuando alguien pregunta por qué el otro llegó primero.
- Ninguna sale hasta que la banda reponga el saldo. — Trato igual para los dos compradores, y demora la que sí podía salir.


## Cierre y prioridades

Últimas decisiones que cruzan todo el mapa: lo que quedó descartado, lo que quedó diferido, lo
que sigue abierto y el orden de construcción.

### c1 · ¿Se ratifica lo descartado y lo diferido?

Trece propuestas fueron evaluadas y quedaron afuera o para más adelante, cada una con su
fundamento. Ratificarlas evita rediscutirlas sin contexto nuevo.

Opciones del listado:
- Marketplace con división automática de pagos — Descartado: Incorpora a Deoco a la cadena de pagos y expone la plataforma a retención de fondos o baja ante contracargos, sin ingreso asociado
- Generación asistida de logotipos — Diferido: Costo variable por generación absorbido por Deoco; demanda real acotada, porque la banda con logotipo no lo cambia y la que no lo tiene recurre a un diseñador. Reconsiderable como complemento pago
- Comisión sobre directorios de venues y creativos — Descartado: Reintroduce a Deoco en el flujo de fondos y contradice el principio rector
- Mapa de sala con butacas numeradas — Diferido: Complejidad desproporcionada para eventos de veinte a quinientas personas
- Envíos internacionales — Diferido: Gestión aduanera y cargos imprevistos al comprador en la primera etapa
- Alojamiento de audio y video — Descartado: Costo de almacenamiento y transmisión sin ventaja frente a las plataformas existentes
- Plan gratuito de entrada — Descartado: Con archivos de impresión de 25 MB por diseño, llena el almacenamiento de cuentas que nunca facturan. DEMO cumple la función de captación a precio bajo
- Cobro por contacto derivado a creativos — Descartado: Crea el incentivo de inflar contactos y mete fricción justo donde conviene que no haya ninguna
- Comisión al proveedor sobre la orden — Descartado: Un porcentaje de la transacción reintroduce a Deoco en el flujo de fondos. La suscripción y el arancel de verificación obtienen ingreso sin ese riesgo
- Asignación de CPU y memoria por banda — Descartado: Exige un contenedor por cliente y es inviable a escala de cientos. Se controla con cuotas de negocio y protecciones de concurrencia
- VPS autogestionado como plataforma inicial — Diferido: Contradice la premisa de no sostener administración de servidores y arriesga la fecha de la fase 2. Reconsiderable como destino de los trabajos pesados una vez que el producto facture
- Ejecución de trámites ante organismos — Descartado: Requiere figura de gestoría y responsabilidad profesional; Deoco orienta y prepara, no presenta

**RESPUESTA: Sí, todo como está.**
Queda cerrado con su fundamento escrito.

Descartadas:
- Sí, salvo las que indico abajo. — Escribí cuáles reabrís y qué cambió para justificarlo.
- Quiero reabrir el marketplace con reparto automático. — Es la más grande de las descartadas y toca la regla rectora.

### c2 · De la agenda abierta, ¿qué hay que resolver antes de empezar a construir?

Diecinueve temas siguen sin definición, cada uno con la fase que bloquea. Los marcados acá se
tratan en la fase 0; el resto espera a su fase.

Opciones del listado:
- Proveedores iniciales (bloquea Fase 3): Con quiénes se arranca y quién valida el modelo de crédito en operación real
- Mantenimiento de la tabla de aranceles (bloquea Fase 3): Quién la revisa, con qué frecuencia y cómo se avisa a las bandas cuando una pasarela cambia sus condiciones
- Precios y moneda (bloquea Fase 3): Cómo fija precios la banda, en qué moneda ve el comprador, quién absorbe la diferencia cambiaria
- Plazo de financiación (bloquea Fase 3): Cuánto espera una orden sin crédito antes de cancelarse y qué se comunica al comprador
- Bloques del sitio (bloquea Fase 2): Especificación campo por campo, cantidad de imágenes y medidas por formato
- Medidas de lanzamiento (bloquea Fase 2): Tamaños por plataforma, actualizables sin intervención en el código
- Cobertura de guardia (bloquea Fase 2): Quién responde severidad crítica y modo evento fuera de horario hasta que exista la etapa 1 de Backline
- Primera contratación de Backline (bloquea Fase 2): Perfil, modalidad de contratación y umbral de bandas que dispara el ingreso
- Proveedor de auditoría externa (bloquea Fase 3): Con quién se hace la revisión anual de seguridad y qué alcance tiene
- Producto discontinuado (bloquea Fase 3): Plazo para reemplazarlo y tratamiento de las órdenes ya cursadas
- Precio de cada plan (bloquea Fase 2): Nivel absoluto en el mercado argentino; los límites ya están propuestos, falta el número
- Plataforma de despliegue (bloquea Fase 0): Confirmar proveedor gestionado y fijar tope de gasto en duro antes de escribir código de producto
- Umbral de cobro a proveedores (bloquea Fase 5): A partir de cuántas órdenes mensuales deja de ser gratuita la suscripción de proveedor
- Ajuste de los pesos por unidad (bloquea Fase 0): Verificar con un proveedor real el tamaño del archivo de impresión, que define el 60% del almacenamiento
- Segmentación de planes (bloquea Fase 5): Validar los límites propuestos con datos de consumo reales; prueba, cupones y cambios de plan
- Central de eventos (bloquea Fase 5): Alcance, moderación, control de spam y figura legal del agregador
- Adopción de venues (bloquea Fase 5): Validar que existe incentivo real antes de construir el directorio
- Recuperación ante fallas (bloquea Fase 1): Tiempo de indisponibilidad y pérdida de datos admisibles en el peor escenario

**RESPUESTA (varias):**
- Proveedores iniciales y validación del modelo de crédito. — Sin esto no hay fase 3.
- Precio de cada plan y moneda. — Sin esto no se puede vender ni proyectar.
- Plataforma de despliegue. — Condiciona el trabajo desde el primer día.
- Verificar el peso real del archivo de impresión con un proveedor. — Es el supuesto más frágil del dimensionamiento.

No elegidas:
- Cobertura de guardia y primera contratación de Backline.

### c3 · ¿Se acepta el orden de construcción propuesto?

Cada fase produce valor por sí misma y prepara la siguiente. La fase 2 es la única que factura
temprano.

Opciones del listado:
- Fase 0: fundaciones, pruebas de concepto y cierre de decisiones
- Fase 1: núcleo, cuentas, dominios, suscripciones y cuotas
- Fase 2: sitio y press kit · primer producto vendible
- Fase 3: comercio, proveedores y calculadora de precio
- Fase 4: ticketing, app de puerta y registro de obra
- Fase 5: red de proveedores, vitrinas y producción multipaís
- Fase 6: facturación fiscal

**RESPUESTA: Sí, tal como está.**
Se avanza con ese orden.

Descartadas:
- Sí, con cambios que indico abajo. — Escribí qué movés y por qué.
- No. Quiero adelantar ticketing. — Retrasa la fase que factura; escribí con qué se financia el intervalo.
