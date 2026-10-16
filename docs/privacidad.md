# Privacidad y datos personales de los fans

Investigación de las normas de datos personales que alcanzan a Deoco (Argentina y Brasil) y de lo
que hay que construir para cumplirlas. Fecha: 2026-10-16. **No es asesoramiento legal**: todo lo
marcado **A consultar con abogado** hay que cerrarlo con un profesional antes de construirlo.

## Cómo se armó este documento (leer primero)

- En esta sesión **no se pudo abrir ninguna fuente primaria** (infoleg.gob.ar, argentina.gob.ar,
  boletinoficial.gob.ar, planalto.gov.br y gov.br/anpd estaban bloqueados por la red del entorno). Lo
  que sigue sale de buscadores que muestran fragmentos de esas páginas y de comentarios de estudios
  jurídicos (Marval, Allende, Lefosse, Mattos Filho, entre otros), cotejados entre sí.
- Los links a fuentes primarias son los que encontraron los buscadores. Cada sección dice si el texto
  se confirmó (al menos dos fuentes que coinciden) o si se cita de memoria. Antes de usar cualquier
  texto literal (leyendas, cláusulas), **hay que copiarlo de la fuente oficial**.
- Hay muchas novedades recientes (2025-2026) que cambian el panorama (ver "Cambios recientes" abajo).

## Roles

| Quién | Argentina (Ley 25.326) | Brasil (LGPD) |
|---|---|---|
| La banda | **Responsable** del archivo/base de datos (art. 2) | **Controladora** (art. 5, VI) |
| Deoco | **Encargado**: presta servicios de tratamiento por cuenta de terceros (art. 25) | **Operador** (art. 5, VII; art. 39) |
| El fan (comprador, asistente) | **Titular** de los datos | **Titular** |
| Proveedores de Deoco (Cloudflare, Resend, hosting) | Subencargados. La ley argentina no los menciona: se resuelve por contrato | Suboperadores. La LGPD tampoco los regula en detalle |

Esto encaja con las reglas td3: los datos son de la banda (regla 3), quedan separados por banda
(regla 2, RLS) y la plata no pasa por Deoco (regla 1). Deoco **también es responsable** de sus
propias bases: usuarios del panel, staff, auditoría, cobros de la cuota y compras de dominios.

**A consultar con abogado**: si Deoco pasa a ser corresponsable de algún tratamiento. Por ejemplo,
los frenos por IP (`ipHash`) y la auditoría los decide Deoco y no la banda.

## Cambios recientes que hay que tener en cuenta

- **Fallo "Torres Abad" (CSJN, 30/04/2026)**: declaró inconstitucionales el art. 5 inc. 2 b) (no
  hace falta consentimiento para funciones del Estado u obligación legal) y el art. 11 inc. 3 b) y c)
  de la Ley 25.326. Los comentarios dicen que eleva el consentimiento a rango constitucional. No toca
  la excepción contractual (art. 5 inc. 2 d), que es la que usa Deoco. Fuente secundaria:
  [Marval](https://www.marval.com/publicacion/se-declara-inconstitucionales-excepciones-al-consentimiento-17641),
  [Allende](https://allende.com/privacidad-y-ciberseguridad/el-fallo-torres-abad-y-la-declaracion-de-inconstitucionalidad-de-la-corte-suprema-06-04-2026/).
  No se leyó la sentencia.
- **Reforma de la Ley 25.326 en el Congreso**: proyecto 3397-D-2026 (Rossi, 16/07/2026), que copia el
  proyecto del Poder Ejecutivo de 2023 (estilo RGPD: portabilidad, notificación de incidentes y
  alcance territorial más amplio). Hay otros (Carro, Doñate). **Ninguno está sancionado** a la fecha.
  [Marval](https://www.marval.com/publicacion/nuevo-proyecto-de-ley-de-proteccion-de-datos-17691).
  Si sale, este documento queda viejo.
- **Disposición 10/2008 derogada**: la reemplazó la Resolución AAIP 14/2018 (ver §3).
- **Botón de arrepentimiento**: las Resoluciones 424/2020 y 316/2018 fueron derogadas por la
  Disposición SSDCyLC 954/2025 (ver §13).

---

## 1. Derecho de acceso (Argentina, art. 14)

**Qué dice la ley.** El titular puede pedir la información que haya sobre él. El responsable tiene
**10 días corridos** desde que lo intiman de forma fehaciente. Si no contesta o contesta mal, el
titular puede iniciar el hábeas data. El acceso es **gratuito a intervalos de no menos de 6 meses**,
salvo que el titular acredite un interés legítimo (art. 14 inc. 3). Según el art. 15, la respuesta
tiene que ser clara, en lenguaje accesible y completa, aunque el pedido sea sobre un solo aspecto.
[Ley 25.326 (infoleg)](http://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm) ·
[Decreto 1558/2001](http://servicios.infoleg.gob.ar/infolegInternet/anexos/70000-74999/70368/norma.htm).
Plazos confirmados en varias fuentes. Que el art. 15 pida una respuesta "completa" se cita de memoria.

**Qué construir.**
- **Registro de pedidos de titulares** por banda (tabla con RLS, `tenantId`): tipo (acceso,
  rectificación, actualización, supresión, oposición o baja de publicidad), email del titular, fecha
  de recepción, **vencimiento calculado** (acceso: +10 días corridos), estado y fecha de respuesta.
  Cada cambio va a `auditoria`.
- **Pantalla del panel** (titular de la banda, como `/devoluciones`), abierta en todos los estados de
  la banda, también ARCHIVADA (el plazo legal no se suspende por la cuota impaga). Tiene que mostrar
  los pedidos que vencen pronto, y conviene un aviso en el inicio.
- **"Datos de este fan"**: búsqueda por email en todos los módulos prendidos y apagados (tienda:
  pedidos, envíos; ticketera: compras, entradas nominadas; correo enviado) y un **export para el fan**
  (PDF o JSON legible). El núcleo no conoce módulos: hace falta un punto nuevo en el contrato (por
  ejemplo, una consulta `datos-del-titular`). **Hay que definirlo en la spec**, no está.
- **Formulario público** en el sitio de la banda para pedir acceso (ruta del núcleo). Verifica el
  email con un link y lo carga en el registro. La regla de 6 meses se muestra como dato, no corta
  sola: decide la banda.
- **A consultar con abogado**: qué cuenta como "intimación fehaciente" en un formulario web; si el
  plazo de 10 días corre desde el pedido web o desde que se verifica la identidad; cómo verificar la
  identidad sin pedir más datos de los necesarios.

## 2. Rectificación, actualización y supresión (Argentina, art. 16)

**Qué dice la ley.** El responsable tiene que rectificar, actualizar o suprimir dentro de los **5
días hábiles** desde que recibe el reclamo. La supresión no procede si perjudica derechos de terceros
o si hay una **obligación legal de conservar** los datos (art. 16 inc. 5). Si los datos se cedieron,
hay que avisarle al cesionario. Mientras se revisa, el dato se bloquea o se marca como en revisión.
[Ley 25.326](http://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm).
El plazo está confirmado (incluso por una
[resolución AAIP de 2019](https://www.argentina.gob.ar/sites/default/files/rs-2019-137-apn-aaip_4.pdf)).
Las excepciones del inc. 5 y el aviso al cesionario se citan de memoria.

**Qué construir.**
- Mismo registro que en §1, con vencimiento **+5 días hábiles** (hace falta un calendario de feriados
  argentinos en `@/nucleo/fechas`; no existe).
- **Supresión por módulo**: anonimizar (no borrar filas) lo que tiene obligación de conservarse.
  `tienda_pedido.fiscal` / `ticketera_compra.fiscal` (foto fiscal) y los cobros quedan. Nombre,
  email, dirección y DNI opcional se reemplazan donde se pueda. No se suprime lo que está en curso
  (pedido sin despachar, entrada de un show por venir) hasta que cierre: se le informa al fan.
- La supresión tiene que alcanzar las **copias** (`infra/copias`, retención 30 días / 12 meses):
  documentar que la copia vence sola y que, si se restaura, se vuelve a aplicar la supresión
  (guardar en la base viva una lista de supresiones, con hash del email).
- Correo enviado (`correo`): hoy el cuerpo se borra a los 90 días y la fila a los 365. Con una
  supresión, borrar ya cuerpo y adjuntos de ese titular.
- **A consultar con abogado**: el plazo de guarda fiscal de los comprobantes de venta (tienda y
  entradas), que define qué datos del fan no se pueden suprimir y por cuánto tiempo.

## 3. Consentimiento, deber de informar y leyenda obligatoria

**Qué dice la ley.**
- **Art. 5**: tratar datos es ilícito sin consentimiento libre, expreso e informado, por escrito o por
  un medio equivalente. **Excepción (inc. 2 d)**: no hace falta cuando los datos salen de una
  relación contractual y son necesarios para cumplirla. Eso cubre comprar una remera o una entrada:
  nombre, email, envío, nominación de la entrada. [Ley 25.326](http://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm).
  La [Res. AAIP 4/2019](http://servicios.infoleg.gob.ar/infolegInternet/anexos/315000-319999/318874/norma.htm)
  (criterios orientadores, obligatorios según Marval) da pautas sobre cómo se presta el consentimiento
  por medios no escritos. No se leyó el texto.
- **Art. 6**: al recolectar hay que informar antes y de forma clara: a) finalidad y destinatarios;
  b) existencia del archivo e **identidad y domicilio del responsable**; c) si cada dato es
  obligatorio u optativo; d) consecuencias de dar el dato o de negarse, o de que sea inexacto;
  e) la posibilidad de ejercer acceso, rectificación y supresión. Confirmado en varias fuentes.
- **Resolución AAIP 14/2018** ([argentina.gob.ar](https://www.argentina.gob.ar/normativa/nacional/norma-307621/texto),
  [Boletín Oficial 09/03/2018](https://www.boletinoficial.gob.ar/detalleAviso/primera/179914/20180309)):
  derogó la Disposición DNPDP 10/2008 ([texto viejo](https://www.argentina.gob.ar/normativa/nacional/norma-144735/texto)).
  Art. 2: los responsables deben exhibir en lugar visible la información del art. 6 **antes de la
  recolección**, con especial mención de cómo se ejercen los derechos. Art. 3: una leyenda que
  identifica a la AAIP como órgano de control de la Ley 25.326, con la atribución de atender
  denuncias y reclamos. El texto que circula (cotejar palabra por palabra con el Boletín Oficial):
  > "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley
  > N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes
  > resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
  > protección de datos personales."

  La leyenda vieja de 2008 ("acceso gratuito a intervalos no inferiores a seis meses") ya no es la
  exigida, aunque repetir el art. 14 inc. 3 no está prohibido.

**Qué construir.**
- **Política de privacidad por banda**, generada por Deoco desde una plantilla, en una ruta del núcleo
  en el sitio público (por ejemplo `/privacidad`, que hay que sumar a `RUTAS_NUCLEO` del sitio). Lleva:
  identidad y **domicilio** de la banda como responsable (hoy no se pide: hay que sumar el campo,
  posiblemente desde `datos_fiscales`), finalidades por módulo prendido, destinatarios (proveedor de
  la tienda, Deoco como encargado, subencargados), qué datos son obligatorios, cómo pedir acceso o
  supresión (link al formulario de §1) y la leyenda de la AAIP.
- **Link visible** en el pie del marco público y **aviso corto junto a cada formulario que recolecta**
  (checkout de la tienda, compra de entradas, nominación, newsletter si existe), con la leyenda de la
  AAIP y un link a la política. En el formulario hay que marcar qué es obligatorio y qué es optativo
  (el DNI/CUIT del comprador ya es optativo).
- Guardar **qué versión de la política vio el fan** en cada pedido o compra (versión + fecha).
- **A consultar con abogado**: si la Res. 14/2018 alcanza a la base de una banda (habla de bancos
  "destinados a dar informes"; el decreto reglamentario incluye en esa categoría los privados que
  exceden el uso personal); quién firma la política (banda o Deoco); qué domicilio pone una banda
  sin persona jurídica.

## 4. Deoco como encargado: el contrato de servicios (Argentina, art. 25)

**Qué dice la ley.**
- **Art. 25 inc. 1**: los datos tratados por cuenta de terceros **no pueden usarse con un fin
  distinto** al del contrato, ni cederse a otros, **ni siquiera para conservarlos**.
- **Art. 25 inc. 2**: cumplido el contrato, los datos **se destruyen**, salvo autorización expresa del
  responsable cuando se presuman encargos futuros. En ese caso se pueden guardar, con seguridad,
  **hasta 2 años**.
- **Decreto 1558/2001, art. 25**: el contrato tiene que contener los niveles de seguridad de la ley y
  las obligaciones de confidencialidad, y disponer en particular que **el encargado solo actúa según
  las instrucciones del responsable** y que las obligaciones de seguridad y confidencialidad (arts. 9
  y 10) también le corresponden.

Fuentes: [Ley 25.326](http://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm),
[Decreto 1558/2001](http://servicios.infoleg.gob.ar/infolegInternet/anexos/70000-74999/70368/norma.htm);
comentario en [abogados.com.ar](https://abogados.com.ar/el-encargado-de-tratamiento-de-datos-personales-en-el-derecho-argentino/30096).
Están confirmados "fin distinto", "instrucciones" y el plazo de 2 años. La frase "ni aun para su
conservación" se cita de memoria (un buscador la mostró en la ley uruguaya 18.331, art. 30).

**Qué construir.**
- **Acuerdo de encargo de tratamiento** dentro de los términos que acepta la banda en el alta
  (autogestión `/registro/banda` y alta por el staff): finalidad (operar sitio, tienda, ticketera y
  correo), instrucciones, confidencialidad, seguridad, lista de subencargados, aviso de incidentes y
  destino de los datos al terminar. Registrar la aceptación (versión + fecha + usuario) en
  `auditoria`.
- **Nada de uso propio**: Deoco no puede usar los datos de los fans de una banda para otra cosa
  (métricas cruzadas entre bandas, marketing de Deoco, entrenar algo). Las `mediciones` de `/admin`
  cuentan cosas y no exponen personas: dejarlo escrito como regla.
- **Fin del contrato**: hoy ARCHIVADO conserva todo y desarchivar es del staff. Eso choca con el inc. 2
  si la banda se fue. Hace falta: (a) un evento claro de "fin del servicio" (por ejemplo, archivada +
  X días o baja pedida); (b) export completo antes, que ya cumple la regla td3 3; (c) un pedido de
  autorización expresa para guardar hasta 2 años, por si vuelve; (d) sin autorización, destrucción
  de los datos de fans (no de lo que Deoco debe conservar por la cuota) y una constancia en
  `auditoria`.
- **A consultar con abogado**: cuándo "termina la prestación" (¿archivo? ¿cancelación de la
  suscripción?); si aceptar en un clic alcanza como "autorización expresa"; si hace falta homologar
  algo ante la AAIP.

## 5. Registro Nacional de Bases de Datos (Argentina, art. 21)

**Qué dice la ley.** Hay que inscribir los archivos públicos y los privados "destinados a
proporcionar informes" (art. 21). El decreto incluye en esa categoría los privados que exceden el
uso personal o que tienen como fin ceder o transferir datos. La AAIP dice en su página que los
archivos que permiten obtener información sobre personas deben inscribirse y que no hacerlo puede
acarrear sanciones ([trámites AAIP](https://www.argentina.gob.ar/aaip/datospersonales/tramites)). La
**Res. AAIP 132/2018** ([norma](https://www.argentina.gob.ar/normativa/nacional/norma-315502)) dice
que la inscripción la hace **el responsable**, solo por Trámites a Distancia (TAD), y el responsable
se inscribe primero. La jurisprudencia citada por Marval fue estricta: no exime a quien dice usar la
base "solo internamente".

**Qué construir.**
- **La banda inscribe su base** (es la responsable). Deoco puede ayudar: una pantalla o guía en el
  panel con los datos que pide el trámite (finalidad, categorías de datos, encargado = Deoco, dónde
  están alojados, medidas de seguridad, transferencias) y un campo para cargar el número de
  inscripción, que puede aparecer en la política.
- **Deoco inscribe las suyas**: usuarios del panel, cuota y dominios (clientes = bandas y titulares).
- **A consultar con abogado**: si una banda chica o informal (sin CUIT de persona jurídica) tiene que
  inscribirse; si el encargado tiene que figurar o inscribirse aparte; aranceles vigentes (las cifras
  que circulan son viejas).

## 6. Medidas de seguridad (Argentina, art. 9 y Res. AAIP 47/2018)

**Qué dice la ley.** El art. 9 obliga al responsable y al usuario a adoptar medidas técnicas y
organizativas de seguridad y confidencialidad. La **Res. AAIP 47/2018**
([texto](https://www.argentina.gob.ar/normativa/nacional/resolución-47-2018-312662/texto),
[BO 25/07/2018](https://www.boletinoficial.gob.ar/detalleAviso/primera/188654/20180725)) derogó las
Disposiciones 11/2006 y 9/2008 (niveles básico, medio y crítico, obligatorios) y aprobó medidas
**recomendadas**. El Anexo I (medios informatizados) cubre recolección, control de acceso, control de
cambios, respaldo y recuperación, gestión de vulnerabilidades, destrucción de la información,
**incidentes de seguridad** (registrarlos y comunicarlos) y entornos de desarrollo. El Anexo II cubre
los medios no informatizados. No se leyó el texto de los anexos.

**Qué hay y qué falta** (comparado con el índice del Anexo I):

| Medida | Ya existe en Deoco | Falta |
|---|---|---|
| Control de acceso | Roles y permisos, RLS, `deoco_app` sin BYPASSRLS, sesión con versión, 404 en `/admin` | Revisión periódica de quién es staff |
| Control de cambios | `auditoria` inmutable | — |
| Respaldo y recuperación | `infra/copias` cifradas, prueba de restauración | Documentar el RTO/RPO |
| Vulnerabilidades | — | Actualización de dependencias y aviso de vulnerabilidades (proceso) |
| Destrucción | Limpieza de correos y huérfanos | Supresión por titular (§2) y fin del contrato (§4) |
| Incidentes | — | Registro de incidentes y procedimiento (§11) |
| Entornos de desarrollo | `db:demo` con datos falsos | Regla escrita: nunca datos reales en desarrollo ni pruebas |

## 7. Cookies y rastreo

**Argentina.** **No se encontró una norma argentina específica sobre cookies** ni una guía de la
AAIP al respecto. Lo que circula sale de proveedores de software de consentimiento, que se
contradicen. La lectura más común: si una cookie trata datos personales, se aplican los arts. 5 y 6
(consentimiento informado) en general. La Res. 4/2019 no habla de cookies según las fuentes
consultadas. **A consultar con abogado.**

**Brasil.** Guía orientadora de la ANPD sobre cookies (octubre 2022,
[PDF gov.br/anpd](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf)).
No es un reglamento sino una interpretación: para cookies no necesarias, consentimiento libre,
informado e inequívoco, con botones de **aceptar, rechazar y configurar** en el primer nivel del
banner y sin casillas premarcadas. Para las estrictamente necesarias, el **legítimo interés** puede
ser la base. La ANPD le objetó al portal gov.br un banner con un único botón "aceito". Fuente:
[Mattos Filho](https://www.mattosfilho.com.br/unico/anpd-guia-cookies-protecao-dados/).

**Qué construir.**
- Hoy los sitios públicos usan **una sola cookie**, la de acceso a la compra (httpOnly, un año, solo
  ese sitio; `decisiones-pendientes.md`), estrictamente necesaria. Con eso **no hace falta un banner**.
  Igual hay que listarla en la política (§3) con su finalidad y su duración.
- Regla para el futuro: **cualquier analítica, píxel o script de terceros** en el sitio de una banda
  (por ejemplo, un píxel de Meta que pida una banda) exige antes un banner con
  aceptar/rechazar/configurar al mismo nivel, que no cargue nada hasta que el fan acepte y que guarde
  la elección. Si alguien lo pide, hay que pasarlo por la spec.
- Cloudflare puede poner sus propias cookies (por ejemplo, de bot management). **Verificar** cuáles
  pone hoy en los hosts de las bandas y listarlas.

## 8. Transferencias internacionales (Argentina, art. 12 y Disp. 60/2016)

**Qué dice la ley.** El art. 12 prohíbe transferir datos a países sin protección adecuada, salvo
excepciones (entre ellas, el consentimiento). La **Disp. DNPDP 60-E/2016**
([texto](https://www.argentina.gob.ar/normativa/nacional/267922/texto)) aprobó dos modelos de
contrato (cesión entre responsables y **prestación de servicios responsable → encargado**). Usarlos,
o cláusulas análogas, evita tener que homologar el contrato ante la autoridad. La **Res. AAIP
34/2019** fijó la lista de países adecuados: UE/EEE, Reino Unido, Suiza, Guernsey, Jersey, Isla de
Man, Islas Feroe, Canadá (solo sector privado), Andorra, Nueva Zelanda, Uruguay e Israel (solo datos
automatizados). **Estados Unidos no está.** La **Res. AAIP 198/2023**
([BO 18/10/2023](https://www.boletinoficial.gob.ar/detalleAviso/primera/296189/20231018)) sumó las
cláusulas modelo de la Red Iberoamericana como complemento de las de 2016, no como reemplazo.
[Página de la AAIP](https://www.argentina.gob.ar/transferencias-internacionales).

**Brasil.** La LGPD (art. 33) también limita las transferencias. La ANPD aprobó cláusulas
estándar (Res. CD/ANPD 19/2024, según lo que se recuerda; **no se verificó en esta sesión**).

**Qué construir.**
- **Inventario de subencargados con el país** donde tratan datos de fans: Cloudflare (todo el
  tráfico; EE. UU.), Resend (correo con datos del fan y QR; EE. UU.), el VPS de Easypanel (país a
  confirmar), el almacenamiento de copias (`rclone`, otro proveedor: país a confirmar) y GoDaddy (solo
  datos de la banda o del titular registral, no de fans). Mercado Pago **no** es subencargado de
  Deoco: la banda lo contrata directamente (regla td3 1).
- Para cada uno, conseguir su DPA y verificar si incluye cláusulas compatibles con la Disp. 60/2016 o
  la Res. 198/2023. Si no, firmar las cláusulas modelo argentinas. Publicar la lista en la política de
  cada banda y en el acuerdo de encargo.
- **A consultar con abogado**: si el DPA estándar de cada proveedor (en general armado para el RGPD)
  sirve como "cláusulas análogas" bajo la Disp. 60/2016; si hace falta el consentimiento del fan.

## 9. Newsletter y publicidad (Argentina, art. 27, Disp. 4/2009 y Ley 26.951)

**Qué dice la ley.**
- **Art. 27**: se pueden tratar datos con fines de publicidad si salen de fuentes públicas, los dio el
  propio titular o hay consentimiento. **Inc. 3**: el titular puede pedir **en cualquier momento** el
  retiro o bloqueo de su nombre de la base. **Decreto 1558/2001, art. 27**: toda comunicación
  publicitaria (correo, teléfono, email, internet) tiene que informar de forma **expresa y destacada**
  la posibilidad de pedir el retiro o bloqueo, total o parcial.
- **Disp. DNPDP 4/2009** ([texto](https://www.argentina.gob.ar/normativa/nacional/norma-151221/texto)):
  la opción de retiro o bloqueo y **el mecanismo para ejercerla** van en toda comunicación
  publicitaria. Si el envío no lo pidió o consintió el titular, hay que advertir de forma destacada
  que es publicidad, y en el email **el asunto lleva la palabra "publicidad"**. Si el titular lo pide,
  hay que informarle el nombre del responsable que dio sus datos. No se confirmó que siga vigente:
  ninguna fuente dice que esté derogada.
- **Ley 26.951 "No Llame"** ([Decreto 2501/2014](https://www.argentina.gob.ar/normativa/nacional/240407/texto)):
  alcanza los **servicios de telefonía en cualquiera de sus modalidades**. Quien publicita por
  teléfono consulta el registro cada 30 días y no contacta a los inscriptos. **No se encontró que
  alcance al email.**

**Qué construir** (solo si se hace newsletter o marketing; hoy **no está en la spec**):
- Casilla de suscripción **aparte y sin marcar** en el checkout. La compra no la exige (art. 5:
  consentimiento libre). Guardar la prueba del consentimiento: fecha, texto mostrado y origen.
- En cada envío publicitario: link de baja de un clic que funcione sin sesión, el mecanismo escrito,
  la identidad de la banda y "publicidad" en el asunto si no hubo opt-in previo. La baja va a una
  **lista de supresión por banda**, que `enviarCorreo` consulta antes de mandar publicidad.
- Separar en el contrato los correos **transaccionales** (entradas, QR, estado del pedido), que no son
  publicidad, de los **publicitarios**. Un correo con entradas no mete promociones.
- Ni SMS ni WhatsApp publicitario sin pasar antes por la Ley 26.951. **A consultar con abogado**:
  si mensajería instantánea entra en "telefonía en cualquiera de sus modalidades".

## 10. Brasil: LGPD (Lei 13.709/2018)

**Cuándo aplica.** Art. 3: aplica si el tratamiento busca ofrecer bienes o servicios a personas
**ubicadas en Brasil** o si los datos se recolectaron allá, aunque la empresa esté afuera. Una banda
argentina que le vende entradas o merch a fans en Brasil (envío a Brasil, show en Brasil, precios en
reales) probablemente entra. **A consultar con abogado**: el umbral real (¿alcanza un fan brasileño
que compra una entrada para un show en Buenos Aires?).
[LGPD (planalto)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

**Lo que pide.**
- **Bases legales (art. 7)**: diez, sin jerarquía. Para Deoco sirven **ejecución de contrato** (V), que
  cubre la compra, **cumplimiento de obligación legal** (II), que cubre lo fiscal, y **legítimo
  interés** (IX, con la prueba de equilibrio del art. 10), que cubre el antifraude y los frenos por
  IP. Para el **marketing**, consentimiento (I).
- **Derechos (art. 18)**: confirmación de que hay tratamiento, acceso, corrección,
  anonimización/bloqueo/eliminación de lo innecesario, portabilidad, eliminación de lo tratado con
  consentimiento, información sobre con quién se compartió, revocación del consentimiento. Se piden
  al controlador (la banda). El titular elige el formato, electrónico o impreso (art. 19 §2).
- **Plazo (art. 19)**: confirmación o acceso en formato simplificado, **en el acto**; declaración
  completa (origen, criterios, finalidad), **hasta 15 días** desde el pedido.
- **Controlador y operador (arts. 37-40)**: los dos llevan un **registro de las operaciones** (art.
  37). El operador trata **según las instrucciones del controlador**, y el controlador controla que se
  cumplan (art. 39). Según el art. 42, el operador responde solidariamente si incumple la ley o las
  instrucciones lícitas.
- **Encargado o DPO (art. 41)**: lo designa el controlador. La **Res. CD/ANPD 18/2024** (DOU
  17/07/2024) reglamenta la designación (acto formal, sustituto, identidad pública). Según
  comentaristas, **no obliga al operador**: es buena práctica. La **Res. CD/ANPD 2/2022** (agentes de
  pequeño porte: ME, EPP, startups según LC 182/2021, sin fines de lucro) exime de designar
  encargado, pero obliga a tener un **canal de comunicación** con los titulares, y no vale si hay
  tratamiento de alto riesgo (art. 3). Los blogs dicen que los plazos son el doble, pero eso **no se
  verificó en el texto**. Fuentes secundarias: [Lefosse](https://lefosse.com/?p=23264),
  [Demarest](https://www.demarest.com.br/conselho-diretor-aprova-regulamento-de-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/).
- **A consultar con abogado**: si una banda argentina (o Deoco, empresa extranjera) puede encuadrar
  como "agente de pequeño porte" (las categorías son figuras societarias brasileñas); si una banda
  que vende a Brasil tiene que designar encargado.

**Qué construir.** Lo mismo que en §1 y §2 con dos agregados: (a) vencimiento de **15 días** cuando el
titular invoca la LGPD; (b) **portabilidad**: export en formato estructurado (JSON) de los datos del
fan. Hay que poder elegir el idioma de la política (portugués) si la banda vende en Brasil.

## 11. Incidentes de seguridad

**Argentina.** **No hay una obligación legal explícita** de notificar a la autoridad o a los
afectados en la Ley 25.326. La Res. AAIP 47/2018 **recomienda** registrar los incidentes y
comunicarlos. En la práctica, la AAIP sancionó a Cencosud (multa de $290.000) por no avisarles a los
afectados por una filtración ([abogados.com.ar](https://abogados.com.ar/multa-por-data-breach-en-argentina/29132)).
El proyecto de reforma la incluiría.

**Brasil (Res. CD/ANPD 15/2024, 24/04/2024).** El **controlador** comunica a la ANPD **y a los
titulares** en **3 días hábiles** desde que sabe que el incidente afectó datos personales y puede
causar riesgo o daño relevante. Puede completar la información en 20 días hábiles. Guarda **registro
de todos los incidentes, también los no comunicados, por 5 años**. Fuentes:
[Mattos Filho](https://www.mattosfilho.com.br/unico/regulamento-incidente-seguranca/),
[Legismap](https://legismap.com.br/conteudos/artigos-e-noticias/anpd-publica-resolucao-que-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca).
El número de artículo no se verificó.

**Qué construir.**
- **Registro de incidentes** de Deoco (tabla global, solo staff, que no se modifica, como
  `auditoria`): fecha de detección, bandas y titulares afectados, datos comprometidos, medidas
  tomadas, a quién se avisó y cuándo. Guarda 5 años o más.
- **Aviso a la banda** (la controladora) desde `/admin`: correo con `avisarAlTitular()` y un aviso en
  el panel, **dentro de 24 h** de confirmar el incidente (plazo propuesto, a fijar en el acuerdo de
  encargo) para que la banda llegue a los 3 días hábiles de Brasil.
- **Plantilla de aviso al fan** que la banda puede mandar desde Deoco (origen de la banda), con lo que
  pasó, qué datos, qué hacer y un contacto.
- **A consultar con abogado**: si en Argentina conviene avisar a la AAIP siempre (recomendación de la
  Res. 47/2018 y criterio Cencosud) y quién lo hace, la banda o Deoco.

## 12. Registro de actividad y de tratamiento

La regla td3 4 (auditoría obligatoria) ya cubre buena parte del **registro de operaciones** del
art. 37 de la LGPD. Falta un **documento de tratamientos** por módulo (qué datos del fan, para qué,
con qué base, cuánto se guardan y quién los ve). Conviene que sea un campo del contrato del módulo
(por ejemplo, `datosPersonales: [{ dato, finalidad, base, retencion }]`) para generar con eso la
política de §3 y el inventario de §5. **Hay que definirlo en la spec.**

## 13. Defensa del consumidor: botón de arrepentimiento y botón de baja

**Qué dice la ley.** La **Ley 24.240, art. 34**: en ventas a distancia el consumidor puede **revocar la
aceptación en 10 días corridos** desde la entrega o la celebración (lo que ocurra último). Ese derecho
no se renuncia, y el vendedor tiene que informarlo por escrito.
[Ley 24.240 (infoleg)](http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm).
La **Disp. SSDCyLC 954/2025** (BO de septiembre de 2025, adecuación hasta el 03/11/2025) **derogó las
Res. 424/2020 y 316/2018** y unificó el régimen. Exige un **"Botón de Arrepentimiento"** y un
**"Botón de Baja de Servicios"** visibles y accesibles en el sitio, sin registro previo; un **código
de identificación dentro de 24 h**; y, según comentaristas, para **entradas de espectáculos**, los 10
días se cuentan desde la entrega de la entrada o del comprobante, con aviso al menos 24 h antes del
evento. Una norma de **febrero de 2026** habría permitido pedir pasos de validación de identidad.
Fuentes secundarias: [contadoresenred](https://contadoresenred.com/ejercicio-del-derecho-de-arrepentimiento-y-la-baja-de-servicios-contratados-a-distancia-disposicion-954-2025/),
[Microjuris (feb. 2026)](https://aldiaargentina.microjuris.com/2026/02/06/legislacion-los-botones-de-baja-y-arrepentimiento-ahora-podran-exigir-validacion-de-identidad/).
No se leyó el Boletín Oficial.

**Qué construir.**
- **Botón de arrepentimiento** en el sitio público de toda banda con tienda o ticketera prendida:
  link desde el inicio y el pie, formulario sin cuenta (email + número de pedido o compra), **código
  de arrepentimiento enviado en el momento** (en todo caso, dentro de las 24 h), un pedido con estado
  en el panel de la banda y el plazo visible. La devolución de la plata la hace la banda desde su
  cuenta (como `/devoluciones`, regla td3 1). Si un merch ya mandado a producir se puede devolver,
  hay que verlo con el proveedor (`resolverConProveedor`).
- Para entradas: anular la entrada (`anuladaEn`), devolver el cupo y cortar el pedido a menos de 24 h
  del show.
- **Botón de baja**: aplica a servicios. Para el fan, sirve para darse de baja del newsletter (§9) si
  existe. Para la **banda como cliente de Deoco** (la cuota es un servicio contratado a distancia),
  Deoco necesita su propio botón de baja en `/b/<slug>/pago`, que hoy ya permite "darse de baja":
  **verificar** que cumpla (visible, sin trámites, código en 24 h).
- Informar el derecho de arrepentimiento en el checkout y en el mail de confirmación.
- **A consultar con abogado**: el texto exacto de la Disp. 954/2025 y de la norma de 2026; si el
  arrepentimiento de entradas aplica igual con entradas nominadas o ya transferidas; si hay excepción
  para merch personalizado; quién es "el proveedor" ante el consumidor (la banda; Deoco no vende).

---

## Lista de verificación

| Obligación | Fuente | Qué construir | Verificado |
|---|---|---|---|
| Acceso en 10 días corridos, gratis cada 6 meses | Ley 25.326 art. 14 | Registro de pedidos con vencimiento, búsqueda y export de los datos del fan, formulario público | sí (plazos); a consultar (intimación y verificación de identidad) |
| Rectificación y supresión en 5 días hábiles | Ley 25.326 art. 16 | Vencimiento en días hábiles (feriados), anonimización por módulo, lista de supresión para copias | sí (plazo); a consultar (guarda fiscal) |
| Informar al recolectar | Ley 25.326 art. 6; Res. AAIP 14/2018 art. 2 | Política por banda (domicilio del responsable), aviso en cada formulario, campos obligatorios u optativos, versión vista | sí (art. 6); a consultar (alcance de la Res. 14/2018) |
| Leyenda de la AAIP | Res. AAIP 14/2018 art. 3 | Leyenda en pie y formularios | a consultar (copiar el texto del BO) |
| Consentimiento | Ley 25.326 art. 5; fallo Torres Abad | Compra por relación contractual; opt-in aparte para publicidad | sí |
| Contrato de encargo | Ley 25.326 art. 25; Dec. 1558/01 art. 25 | Acuerdo en el alta, instrucciones, subencargados, fin del servicio, guardar hasta 2 años con autorización o destruir | sí (núcleo); a consultar (fin de la prestación) |
| Registro de bases | Ley 25.326 art. 21; Res. AAIP 132/2018 | Guía e inscripción de la banda; inscripción de las bases de Deoco | a consultar |
| Seguridad | Ley 25.326 art. 9; Res. AAIP 47/2018 | Faltantes de la tabla de §6 | sí (recomendadas, no obligatorias) |
| Cookies (AR) | No hay norma específica | Listar la cookie de acceso; banner si se suma analítica | a consultar |
| Cookies (BR) | Guía ANPD 2022 | Banner con aceptar, rechazar y configurar si se suma analítica | sí (guía, no norma) |
| Transferencias internacionales | Ley 25.326 art. 12; Disp. 60/2016; Res. 34/2019; Res. 198/2023 | Inventario de subencargados por país, DPA o cláusulas modelo, lista pública | sí (EE. UU. no es adecuado); a consultar (DPA como cláusulas análogas) |
| Publicidad: opt-out en cada envío | Ley 25.326 art. 27; Dec. 1558/01 art. 27; Disp. 4/2009 | Baja de un clic, lista de supresión, "publicidad" en el asunto, transaccional separado | sí; a consultar (vigencia de la Disp. 4/2009) |
| No Llame | Ley 26.951; Dec. 2501/2014 | Nada mientras no haya telefonía o SMS | a consultar (mensajería) |
| Incidentes (AR) | Res. AAIP 47/2018 (recomendación) | Registro de incidentes, aviso a la banda, plantilla para el fan | sí (no hay obligación legal); a consultar (aviso a la AAIP) |
| Incidentes (BR) | Res. CD/ANPD 15/2024 | Aviso a la banda en 24 h (propuesto); registro 5 años | sí (3 días hábiles, 5 años) |
| Derechos LGPD, 15 días | LGPD arts. 18-19 | Vencimiento de 15 días, portabilidad en JSON, política en portugués | sí |
| Operador según instrucciones; registro | LGPD arts. 37-39, 42 | Acuerdo de encargo + `auditoria` + documento de tratamientos | sí |
| Encargado (DPO) | LGPD art. 41; Res. 18/2024; Res. 2/2022 | Canal de contacto por banda; DPO de Deoco opcional | a consultar |
| Alcance de la LGPD | LGPD art. 3 | Detectar ventas a Brasil | a consultar |
| Arrepentimiento (10 días, código en 24 h) | Ley 24.240 art. 34; Disp. 954/2025 | Botón en el sitio de la banda, código, pedido en el panel, anulación de entradas | a consultar (texto de la Disp. 954/2025 y la norma de 2026) |
| Botón de baja | Disp. 954/2025 | Baja de la cuota de Deoco en `/pago`; baja del newsletter | a consultar |
