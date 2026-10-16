# Decisiones para revisar

Tomadas sin consultar durante el trabajo largo sin supervisión. Cada una dice qué se eligió
y por qué. Si alguna no va, se cambia.

## B4 · Cómo le paga la banda al proveedor (propuesta, sin construir)

Fuente: `docs/decisiones-3.2-respondidas.md`, «Dinero, precios y liquidación», d1, d2 y d5. Las
dos cosas que no se negocian (td3): el dinero no pasa por Deoco y todo queda en el registro de actividad.

**Hoy.** El fan le paga a la banda, a su propia cuenta de Mercado Pago. Al pagarse el pedido se
crea una `tienda_deuda` por pedido y proveedor (producción más envío), la orden va al proveedor
en el momento y el proveedor marca las deudas como saldadas desde su portal. Es fiado: la orden
sale antes de que la banda pague. El 3.2 pide lo contrario: **crédito prepago**, y la orden queda
retenida si no hay saldo (d5).

**Propuesta: crédito con el proveedor**, una cuenta corriente por banda y proveedor. Deoco la
muestra y la descuenta, pero no tiene la plata.

- **Qué guarda Deoco**, en tablas de la tienda con RLS por banda y lectura del proveedor por
  `app_referencia_externa('tienda')`:
  - `tienda_credito_movimiento` (tenantId, proveedorId, tipo, monto, referencia, estado, quién y
    cuándo). Tipos:
    - `carga`: la banda dice que transfirió; queda `pendiente` hasta que el proveedor la valida, y
      recién ahí cuenta;
    - `consumo`: una orden que se financió;
    - `ajuste`: el proveedor corrige, con nota;
    - `devolucion`: el proveedor le devuelve saldo a la banda.
  - El saldo es la suma de los movimientos validados, calculada en la base y nunca guardada. En
    pantalla siempre aparece como «Crédito con <proveedor>» (d2).
  - En `tienda_orden`, un estado nuevo: `RETENIDA` (sin saldo) → `EN_PRODUCCION` (financiada).
- **Qué guarda el proveedor**, fuera de Deoco:
  - su cuenta bancaria o su alias, que se le muestra a la banda como dato de contacto;
  - el comprobante real de cada transferencia.
  - Deoco guarda solo la referencia que escribe la banda (número de operación, fecha) y, si
    quiere, el comprobante como archivo de la banda, con el recurso `comprobante`.
- **Cómo se entera Deoco de que la plata entró: no se entera solo; se lo dice el proveedor.**
  La banda carga «transferí $X, operación N». El proveedor la ve en su portal y la valida o la
  rechaza. Con la validación sube el saldo y se financian solas las órdenes retenidas, por orden
  de llegada. Así no se lee ninguna cuenta bancaria ni pasarela del proveedor, y el dinero sigue
  sin tocar Deoco. Una carga pendiente pasado el plazo (por ejemplo, 5 días hábiles) se escala
  al staff (`alertasAdmin`, d5 «hay plazo máximo y escalamiento a Deoco»).
- **Retención y plazo (d5)**:
  - una orden sin saldo queda RETENIDA: no se le manda al proveedor ni se cancela;
  - aviso a la banda: «faltan $X de crédito con <proveedor>»;
  - si vence el plazo sin financiarse, se cancela sola y se le devuelve todo al fan desde la
    pasarela de la banda (`@/nucleo/pagos`: hoy no hay devolución por la pasarela de la banda;
    hay que agregarla).
- **La banda se va con saldo**: el saldo es del proveedor y la devolución se arregla entre ellos.
  Deoco solo muestra el saldo y el movimiento `devolucion` cuando el proveedor lo registra.
- **Lo que hoy existe y se reemplaza**: `tienda_deuda` y «Marcar saldadas». Las deudas viejas
  sin saldar se migran a movimientos de consumo con saldo negativo, como único caso de deuda
  histórica, para que nadie pierda la cuenta.

**Abierto, para decidir antes de construir**:
1. El plazo para financiar una orden retenida antes de cancelarla y devolverle el dinero al fan.
2. El plazo para que el proveedor valide una carga.
3. Si una banda con saldo negativo heredado puede tener órdenes nuevas mientras lo debe. Propuesta:
   no; queda retenida como si no tuviera saldo.
4. **Choque con multipaís (d6)**: una banda y un proveedor de países distintos implican crédito en
   otra moneda. Propuesta: el crédito queda en la moneda del proveedor, y una banda no puede
   elegir un proveedor de otra moneda hasta que exista `multipais`.

## B6 · La unidad de cuenta es el músico (td2): estado del modelo (no se construye)

**¿Hoy un usuario puede estar en más de una banda?** Sí.
- `usuario` es global (`email` único) y `membresia` es (usuario, banda, rol), única por par.
- El selector de `app.<raiz>` lista todas las bandas de la persona (`bandas_visibles`), y el rol
  se resuelve en cada pedido según la banda del pedido.
- La sesión guarda solo el usuario.
- Para invitar a alguien que ya tiene cuenta se le suma una membresía, sin crear un usuario nuevo.
- La única limitación es de la autogestión: una cuenta crea una sola banda por `/registro`
  (`crear_banda_autogestion`, la impone la base). Las demás bandas se las da el staff.

**¿Qué pasa cuando se va de una?**
- Solo el staff puede sacar a alguien (`quitarMiembro`, en `/admin`). La banda no puede, y la
  persona tampoco puede irse sola.
- Se borra la membresía, con confirmación, nunca dejando la banda sin titular. Queda en la auditoría.
- La cuenta de la persona sigue entera y conserva las otras bandas.
- Lo que hizo en la banda queda a nombre de la banda. La auditoría y `validadaPor` guardan su
  id, y no hay borrado en cascada.
- Si la persona era la creadora autogestionada (`tenant.creadoPor`), sigue figurando así: no
  puede crear otra banda por `/registro` aunque ya no esté en esa.
- **Si la banda se disuelve** (ARCHIVADO), las cuentas de las personas no se tocan. El cobro, en
  cambio, es de la banda:
  - la cuota está en `comercial_cuenta` por tenant;
  - no hay nada de la persona que trascienda el proyecto: historial, obras, plan propio;
  - por eso la baja estructural que señala td2 existe del lado del cobro, no del lado del acceso.

**¿Cuánto falta para que la cuenta sea de la persona?** Poco en el acceso, bastante en el cobro.
1. Ya está:
   - identidad, sesión y login por persona;
   - varias bandas por persona;
   - rol por membresía;
   - RLS por persona en `usuario`.
2. Falta, en el núcleo:
   - que la persona se vaya sola de una banda («dejar esta banda», salvo si es el último titular);
   - que el titular invite y saque gente desde el panel, sin el staff;
   - quitar el tope de una banda por cuenta en la autogestión, o atarlo al plan de la persona;
   - un perfil de la persona (nombre artístico, instrumentos) que no sea de ninguna banda.
3. Falta, en el cobro (el cambio grande):
   - mover el sujeto de la cuota de la banda a la persona, o tener las dos cosas: un plan de la
     persona que cubra N proyectos;
   - hoy `comercial_cuenta`, la escalera de mora y `fijarEstado` son por banda.
   - Es una decisión de producto antes que de esquema: ¿paga el músico o paga la banda?
4. Falta, en lo que la persona se lleva al irse:
   - las obras y el registro de obra (módulo `obra`, que no está construido) deberían ser de la
     persona, con una licencia a la banda; hoy toda tabla de módulo es por banda.
   - Es el punto que condiciona el esquema: si `obra` se construye por banda, después cuesta caro
     migrarla.

Recomendación: antes de construir `obra` o cambiar planes, decidir el punto 3 (quién paga) y si
las obras son de la persona. El resto (punto 2) es chico y no cambia el esquema.

## Exportación completa de los datos de la banda (propuesta, sin construir)

Regla td3: los datos son de la banda y la exportación está siempre disponible.

**Dónde**:
- Un botón «Exportar todo» en el panel, núcleo, `/b/<slug>/exportar`, solo para el titular.
- Abierto en **todos** los estados, también con la banda suspendida o archivada, igual que
  `/dominios`: es la salida.
- Lo registra la auditoría (quién y cuándo).

**Cómo**:
- Se arma en segundo plano, porque con archivos puede ser grande.
- Cuando está listo, llega un mail al titular con un link firmado (`urlFirmada`, vence a las 48
  h). El link también aparece en la pantalla, y la pantalla sirve aunque se cierre la página.
- Una exportación por banda a la vez. El zip se borra a los 7 días.

**Formato**: un `.zip` con formatos abiertos.
- `LEEME.txt`: qué es cada archivo, fecha y versión del formato.
- `datos.json`: todo junto, por módulo, con las relaciones por id.
- Un `.csv` por entidad (UTF-8 con BOM, para que Excel lo abra bien):
  - `contactos.csv`;
  - `compradores.csv`, de pedidos y entradas, deduplicados por email;
  - `asistentes.csv`, entradas nominadas, con nombre, documento, show y si entró;
  - `productos.csv`;
  - `pedidos.csv` y `pedidos-renglones.csv`;
  - `shows.csv` y `tipos-de-entrada.csv`;
  - `sitio.csv`: perfil, fechas manuales, links, publicaciones.
- `archivos/`: los originales con su nombre (`<recurso>/<id>-<nombre>`), más
  `archivos.csv` (id, recurso, tipo, tamaño, fecha).

**Diseño genérico**:
- Contrato nuevo de módulo, `exportacion: { nombre, exportar(tx) → { archivo, filas }[] }`.
- El núcleo no nombra módulos: suma lo de cada módulo prendido y lo que hubo en módulos apagados
  (los datos siguen siendo de la banda).
- Archivos y dominios los exporta el núcleo.
- Todo pasa por `conTenant`.
- Una prueba exige que toda tabla con `tenantId` de un módulo aparezca en su exportación, o que
  esté marcada como interna con una razón (por ejemplo, `tienda_deuda` va; `correo` no).

**Fuera del alcance**:
- secretos, que nunca salen;
- hashes de clave;
- tokens;
- la auditoría del staff;
- datos de otras bandas (las órdenes del proveedor solo con lo de esta banda).
- «Obras» no existe todavía (no hay módulo `obra`): entra cuando se construya.

**Preguntas**:
1. Los datos personales de fans (compradores, asistentes) se exportan completos, porque son
   datos de la banda. ¿Se agrega un aviso de responsabilidad sobre datos personales al
   descargarlos?
2. ¿Se exporta también el historial de cobros de la cuota (lo que la banda le pagó a Deoco)?

## D2 · Lo que la lista de IPs de Cloudflare no cubre (anotado, sin hacer)

**Situación.** Deoco va detrás de Cloudflare con la opción A acotada (`docs/despliegue.md`, "Todo
detrás de Cloudflare"): certificado de cliente de Cloudflare (Authenticated Origin Pulls) solo
en `app.<raíz>`, y lista de IPs de Cloudflare en todas las rutas de Deoco. Traefik no puede
exigir el certificado en los subdominios de banda ni en los dominios propios sin tocar
`default`, que rompería los otros servicios del VPS.

**El hueco.** Alguien con **su propia cuenta de Cloudflare** puede apuntar un host suyo a nuestra
IP: el pedido llega desde una IP de Cloudflare y pasa la lista. Hoy solo llega a hosts que la app
no conoce (404): no puede usar el host de una banda, porque esas zonas y custom hostnames están
en nuestra cuenta. En `app.` no pasa (ahí sí se exige el certificado de cliente).

**Decisión: no hacer nada por ahora.** Si algún día hace falta cerrarlo (por ejemplo, si la app
empieza a responder algo útil a hosts desconocidos), la salida es un **Cloudflare Tunnel** para
Deoco: `cloudflared` sale del VPS hacia Cloudflare y el tráfico de Deoco ya no entra por el 443
(ni ruta comodín ni lista de IPs). Los custom hostnames y las zonas delegadas apuntarían al
túnel. Pide un ensayo con Cloudflare real.

## D9 · El cobro de los dominios

1. **Medios diferidos: excluidos, no hizo falta otra salida.** Checkout Pro con `binary_mode: true`
   (aprobado o rechazado, nunca pendiente) y `excluded_payment_types` `ticket`, `atm` y
   `bank_transfer`. El link de pago vence a las 2 h. Igual, si algo se cuela, no se pierde plata:
   un dominio tomado en el medio hace fallar la compra y el pago se devuelve solo.
2. **La plata es del gestor; los pasos, del núcleo.** El núcleo solo marca "devolución pendiente"
   y se la pasa al gestor (`pedida`); el gestor la corre, la reintenta (5 min → 12 h) y a los 3
   intentos la pone "fallida" en rojo arriba de todo el back office (`alertasAdmin`), sin dejar
   de reintentar. Salida manual: "devuelta a mano", con nota obligatoria.
3. **Un pago aprobado de más se devuelve solo** (repetido, de otro cobro de lo mismo, otro monto).
   No se le pregunta a nadie: la banda no pidió dos dominios.
4. **24 h sin poder arrancar la compra** (la configuración del registrador rota, por ejemplo) →
   se devuelve. Antes, el staff lo ve en rojo a los 30 minutos.
5. **Los mails del gestor salen siempre desde Deoco**, aunque la banda tenga su dirección
   verificada (antes, la cuota habría salido desde merch@labanda.com: era un bug).

## D13 · Cierre (ensayo, carga y repaso)

Detalle en `docs/repaso-dominios.md`. Para decidir vos:

1. ~~**Privacidad del WHOIS**~~ → decidido: se ofrece, incluida en el precio, activada por
   defecto. Hecho: el costo se suma al precio por terminación (lo fija el staff); la terminación
   que no la permite se marca y la banda lo ve antes de comprar. Decidido sin preguntar: el costo
   de la privacidad lo carga el staff a mano (la API de GoDaddy no lo informa en la disponibilidad,
   hasta donde se sabe: SIN CONFIRMAR); se cobra también en la renovación (se suma igual); la
   transferencia entrante (sin pantalla todavía) sigue sin privacidad; las compras anteriores
   quedan como estaban (sin).
2. **Re-bloquear un dominio** si pidieron el código y no lo transfirieron en 30 días (necesita el
   endpoint de bloqueo de GoDaddy, sin confirmar).
3. **Datos del titular de cobros que nunca se pagaron**: hoy quedan para siempre. Propuesta: borrar
   a los 30 días en la limpieza diaria.
4. **Devolución "a mano"**: que pida el número de operación de Mercado Pago y se verifique.
5. **Más de un proceso de la app**: cada uno con su cola de GoDaddy; repartir
   `DEOCO_GODADDY_POR_MINUTO`. Y una cola para la API de Cloudflare (hoy no tiene).

Decidido sin preguntar: las compras y los vencimientos corren aparte del barrido; "Recibimos tu
pago" va en la transacción de la compra; solo el gestor puede declarar un dominio pago; vender
dominios exige la clave de avisos; una revisión que Cloudflare no contesta se reintenta a los 15
minutos; el `www` por CNAME de un comprado no ofrece "pasarse a delegar".

## D12 · Las cinco salidas, sin staff

1. **Comprado que se lleva solo el DNS**: no existía. Como el dominio está en la subcuenta de Deoco, la
   banda no puede cambiar los nameservers: "Llevarme solo el DNS" arma la lista (como un delegado) y
   después la banda pega los nameservers de su proveedor nuevo y **Deoco los pone por ella** (operación
   `dns` de la máquina, sin cobro). Cuando se propagan, la zona se da de baja como siempre y la fila del
   dominio queda como "solo registro" (`soloRegistro`): no llega a Deoco, pero se renueva, se transfiere
   y se le cambia el titular desde el panel.
2. **Ese comprado nunca queda sin DNS**: si pide llevarse el DNS y en 90 días no pasa los nameservers, la
   salida se cancela sola (no se da de baja la zona, que sigue siendo la que usa). El aviso de la semana
   antes lo dice así.
3. **"Me quedo en Deoco" después de que pusimos sus nameservers**: Deoco vuelve a poner los de la zona.
4. **Pendiente**: un comprado con el DNS afuera que quiere volver a tener el DNS en Deoco. Hoy no hay
   botón (no queda presa: el dominio es suyo, lo maneja en su proveedor). Se puede sumar con la misma
   máquina (zona → nameservers → activación).
5. **"Transferir a Deoco" (delegado → comprado), el D12 del plan original, no se hizo**: esta parte se
   redefinió como el repaso de las salidas. No deja a nadie presa (es para entrar, no para salir) y el
   diseño ya decía que puede quedar para después del lanzamiento. `transferirAca` del registrador existe
   y está sin confirmar.

## D11 · Renovación y salida de los comprados

1. **Calendario**: el barrido mira una vez por hora; manda el aviso que toca (45, 30, 15, 7, 3 o 1
   día antes), uno por vencimiento y aviso (`unica`). Si el barrido estuvo parado, manda solo el
   que toca ahora, no los que se saltearon. Desde los 15 días el mail dice qué se pierde; desde los
   3, que hay gracia. En el panel, aviso fijo desde los 30 días (rojo desde los 7 y vencido).
2. **Delegados y `.com.ar`**: la fecha la carga la banda (opcional) y se avisa igual, "renovalo en tu
   registrador / en nic.ar". No se consulta el WHOIS/RDAP (pendiente si hace falta).
3. **Renovar se puede con la banda en cualquier estado** (suspendida o archivada también): la cuota no
   puede hacer perder un dominio. Pagar dos veces el mismo vencimiento no se puede (y si pasa, se
   devuelve). Si en 24 h no se pudo renovar y el registrador no muestra un vencimiento nuevo, se
   devuelve el pago.
4. **Vencido sin renovar**: el principal vuelve al subdominio, el remitente vuelve a Deoco (un dominio
   vencido no manda mails), nada se borra. **Gracia de 30 días** al precio de siempre; **30 más de
   recuperación** con recargo (se cotiza a mano: "escribinos"). Pasado eso, si el registrador lo
   liberó (no está en la subcuenta), se pierde: se dan de baja zona, correo y filas, con mail y
   auditoría. Los plazos reales de GoDaddy están por confirmar (`plazos.ts`, un solo lugar).
5. **Renovado en la gracia vuelve a ser el principal** si lo era.
6. **El código de transferencia no va por mail ni se guarda**: se muestra en el panel al titular cada
   vez que lo pide (un mail queda 90 días en la tabla `correo`). El mail solo avisa que se pidió.
7. **Bloqueo de 60 días** (reglas del registro) contado desde la última alta o cambio de titular
   terminados. No se vuelve a bloquear el dominio si la transferencia nunca se hace (pendiente:
   re-bloquear a los 30 días).
8. **Al irse por transferencia queda delegado**: la zona sigue (los nameservers no cambian), renueva
   la banda y la fecha queda sin cargar.
9. **Cambio de titular por la misma máquina** (tipo `titular`, sin cobro): reintentos, dato rechazado
   con corrección, progreso. 24 h sin poder → queda como estaba, con mail.

## D10 · Las pantallas de compra

1. **Entre "titular" y "pago", los datos viajan en una cookie del panel** (httpOnly, solo la ruta de
   compra de esa banda, una hora), no en una tabla ni en la URL. Al pagar se valida todo de nuevo
   (precio, disponibilidad, condiciones vigentes del registrador), así que tocarla no da nada.
2. **Teléfono**: se acepta como lo escribe la gente ("11 4567-8900") y se pasa al formato del
   registro (+54.1145678900); sin código de país se asume Argentina.
3. **Precargado con quien compra** (un titular de la banda), no con "el primer titular". El mail
   de Mercado Pago también es el de quien compra.
4. **Suspendida o archivada no compra dominios nuevos**; sí los renueva y se los lleva (D11). Una
   cuota impaga no puede hacer perder un dominio.
5. **"Falta un dato" no espera para siempre**: si la banda no corrige el dato que rechazó el
   registrador en 7 días, la compra falla y se devuelve el pago (antes se mira la subcuenta: si
   quedó registrado igual, sigue).
6. **Mail al recibir el pago** ("Recibimos tu pago: estamos registrando…") con el link a "Tus
   compras": la banda puede cerrar la página y volver. La pantalla se arma de la base cada vez y
   se refresca sola mientras algo está en curso.
7. **El paso "Correo" del diseño no está en el progreso**: el correo desde el dominio lo elige la
   banda después (Panel → Correo); al terminar, la pantalla la manda ahí.

## P1 · Planes, cuotas y estados (módulo comercial)

1. **Cómo se reparte**: el núcleo no sabe de planes. Ofrece capacidades genéricas para UN
   módulo "gestor de cuenta" (`gestionaCuenta`): fijar el estado automático (ACTIVO/MOROSO/
   SUSPENDIDO), el set exacto de módulos prendidos, los topes por banda (`limite_banda`) y el
   espacio; avisos sin banda (`avisosPlataforma`) y tareas periódicas del barrido. El módulo
   `comercial` traduce planes a eso. Otro gestor (u otra forma de cobrar) no toca el núcleo.
2. **La cuota es la única plata que entra a Deoco**: credenciales en el entorno
   (`DEOCO_CUOTA_MP_TOKEN`, `DEOCO_CUOTA_MP_SECRETO_AVISOS`), nunca en `secreto`. Solo el gestor
   puede usarlas (`@/nucleo/pagos/cuota` lo verifica contra el registro). Cobros en
   `comercial_cobro`, nunca en las tablas de ventas. Webhook propio, sin banda en la URL:
   `app.<raiz>/avisos/plataforma/comercial/cuota/mercadopago`.
3. **Sin prorrateo**: cambiar de plan con la suscripción activa se aplica al instante (módulos y
   topes) y el monto nuevo se cobra desde el próximo ciclo (PUT del monto en Mercado Pago). Subir
   a mitad de mes regala días del plan caro; bajar, cobra un mes más del caro. Es lo más simple
   y no deja a nadie sin lo que eligió. Se dice en pantalla.
4. **En la prueba, el plan elegido se aplica al autorizarse la suscripción** (cuando el titular
   carga la tarjeta), no al elegirlo. El primer cobro es al terminar la prueba (`start_date`).
5. **Vencido → MOROSO → SUSPENDIDO, igual para todos los casos** (cobro rechazado, suscripción
   cancelada que llegó al vencimiento, cobro que nunca llegó): MOROSO a los `diasGracia` (3) del
   vencimiento si no llegó un cobro aprobado, o al instante con un rechazo; SUSPENDIDO a los
   `diasMoraASuspender` (10) de mora. Los plazos los edita el staff (Planes → Plazos).
6. **Fin de la prueba sin forma de pago autorizada → SUSPENDIDO directo** (sin pasar por
   MOROSO): así lo pide la spec. Con la suscripción autorizada, espera el primer cobro.
7. **Pago aprobado → ACTIVO al instante**, también desde SUSPENDIDO. Suma un mes desde el
   vencimiento (o desde hoy, si ya pasó).
8. **ARCHIVADO nunca es automático**: el gestor no puede archivar ni desarchivar (lo impone el
   núcleo), y una banda ARCHIVADA no se toca.
9. **El Pro y los planes a medida no se revisan solos**: no están a la venta, el cobro lo acuerda
   el staff; el barrido no los pasa a mora. Si una banda Pro tiene suscripción activa y el staff
   pone un precio a medida, se actualiza el monto.
10. **Precios en pesos, NULL al empezar**: la migración siembra los 4 planes con la referencia en
    dólares (8/20/45/a convenir) pero sin precio en pesos. Sin precio, un plan no se puede elegir
    (se muestra "Próximamente"). El staff los pone en Back office → Planes.
11. **Topes y espacio sembrados** (para revisar): Esencial = sitio, 1 GB. Medium = sitio + tienda,
    5 GB, 20 productos publicados. Premium = + ticketera, 20 GB, 100 productos y 30 shows. Pro =
    todo, 100 GB, sin topes. Son un punto de partida.
12. **Qué cuenta el tope de shows**: los shows publicados que todavía no pasaron (lo mismo que
    muestra el sitio). Un show viejo no ocupa lugar.
13. **Bajar de plan despublica, no borra**: lo último publicado primero (`publicadoEn`, columna
    nueva en productos y shows; los ya publicados toman la fecha de su última edición). Las
    entradas vendidas de un show despublicado siguen valiendo. El espacio no se ajusta: si queda
    por encima del nuevo límite, solo no puede subir más (no se borra ningún archivo).
14. **Al llegar a un tope**: el mensaje dice el número y el plan a la venta más barato que lo
    resuelve ("El plan Premium permite hasta 100: cambialo en Plan y pago."); si ninguno, el Pro.
    Dos pedidos a la vez no pasan el tope: un `pg_advisory_xact_lock` por banda + límite.
15. **Alta por el staff**: también arranca la prueba (14 días de Medium). El staff puede ponerle
    otro plan desde Cuentas → la banda. Las bandas que ya existían quedan "sin cuenta" (sus
    módulos no se tocan) hasta que el staff les asigne un plan.
16. **Mails de la cuota**: remitente "Deoco", responder-a `DEOCO_CUOTA_RESPONDER_A` si está (si
    no, el titular). Uno por día como mucho (clave única) para mora y para suspensión.
17. **Mercado Pago, a verificar con la cuenta real**: los campos de `/preapproval` y
    `/authorized_payments` (estado del pago dentro del cobro, `debit_date`, `payment_method_id`)
    se leen a la defensiva; el webhook de suscripciones usa los tipos
    `subscription_preapproval` y `subscription_authorized_payment`. Está en la lista de
    verificación del despliegue.

## P2 · Autogestión del alta

1. **Flujo**: `/registro` (nombre, email, contraseña) → mail con link → `/registro/verificar`
   (crea el usuario) → ingresar → `/registro/banda` (nombre, subdominio, "probar gratis" o un
   plan) → panel de la banda. Después de verificar se vuelve a ingresar con la contraseña (no hay
   ingreso automático: Auth.js con credenciales no tiene "ingreso por link", y agregarlo era abrir
   otra puerta de entrada).
2. **Antiabuso, lo más simple que alcanza**:
   - el usuario recién existe al confirmar el email (antes, una fila en `registro_pendiente` que
     nadie lee: sin políticas abiertas, sin permisos para `deoco_app`; solo funciones acotadas);
     sin email verificado no hay cuenta, ni banda, ni subdominio reservado;
   - el token del link va después de "#" (nunca llega a un servidor ni a un log) y se guarda solo
     su sha256; vale 24 h y una vez;
   - **una banda por autogestión por cuenta** (la base lo impone, con bloqueo por usuario); más,
     por el staff;
   - 3 mails de verificación por hora por email (en la base); 5 registros y 3 bandas por hora
     por IP (en memoria del proceso: un solo contenedor hoy; con varios, cada uno cuenta lo suyo);
   - un campo trampa oculto que un bot llena (se responde "ok" sin hacer nada);
   - la pantalla responde lo mismo si el email ya tiene cuenta (el mail lo explica): no se puede
     averiguar quién está registrado.
   Sin captcha: agrega un tercero y fricción; si aparece abuso real, es lo siguiente.
3. **"Con el sitio listo"** = el subdominio verificado y en línea (muestra "en preparación" hasta
   que publique), el módulo sitio prendido por la prueba, y la persona en su panel. No se
   publica contenido de ejemplo (sería inventar el sitio de la banda).
4. **Eligiendo un plan al crear la banda**: igual arranca la prueba; va a la pasarela de Deoco a
   cargar la forma de pago y el plan se aplica al autorizarse (el primer cobro, al terminar la
   prueba). Si la pasarela falla, queda en prueba (no se pierde la banda).
5. **Subdominios reservados**: una lista en el núcleo (`src/nucleo/tenant/reservados.ts`), la
   misma para el staff y la autogestión: los de la plataforma y los que se prestan a engañar
   (soporte, pagos, login…). No incluye ids de módulos (el núcleo no los nombra).
6. **El staff** ve las altas nuevas en `/admin` (filtro "Alta: Autogestión", insignia) y conserva
   todo: estado, módulos, plan, archivar. Cada alta deja su fila en la auditoría
   (`usuario.registrado`, `banda.autogestionada`).
7. **`/ingresar` suma una sola línea**: "¿No tenés cuenta? Creá tu banda". Sin ella no hay forma
   de llegar al registro. Es lo único que se agrega a esa pantalla.
8. **Sin `DEOCO_CORREO` no hay registro** (no se puede verificar el email): la pantalla lo dice.

## P3 · Inicio del panel

1. **Cómo se arma**: cada módulo que quiere un bloque ofrece la consulta `inicio` (la
   convención es el nombre); el núcleo recorre los prendidos, la pide con `consultar()` (apagado,
   error o demora → no hay bloque) y valida la forma. Así "ticketera apagada → no hay bloque" sale
   solo, y el núcleo sigue sin nombrar módulos.
2. **Quién ve qué**: un bloque, quien puede ver alguna entrada del menú de ese módulo; el de la
   cuenta (plan, vencimiento, espacio), solo el titular, igual que Plan y pago.
3. **"Para hacer" arriba**, juntando los pendientes de todos los bloques (el mismo texto una sola
   vez: "Conectá tu cuenta de cobro" lo dicen tienda y ticketera).
4. **Qué muestra cada uno** (lo pedido, nada más): cuenta = plan, prueba/pagado hasta, espacio;
   tienda = pedidos del mes (pagados este mes, hora argentina), vendido en el mes, en producción
   sin despachar, deuda con proveedores; entradas = próximo show, vendidas, disponibles; sitio =
   si está publicado o tiene cambios sin publicar. Pendientes: sitio sin publicar, cobro sin
   conectar, pagos para revisar, sin productos publicados, elegir plan en la prueba, cuota impaga.

## P4 · Endurecimiento

1. **Limpieza de correos** (una vez por día, desde el barrido, en tandas de 5.000): solo lo
   ENVIADO. A los `DEOCO_CORREO_DIAS_ADJUNTOS` (7) se vacían los adjuntos, a los
   `DEOCO_CORREO_DIAS_CUERPO` (90) el html y el texto (quedan para quién, asunto, fecha y
   estado), a los `DEOCO_CORREO_DIAS_BORRAR` (365) se borra la fila. PENDIENTE, ENVIANDO y FALLIDO
   no se tocan nunca (un FALLIDO "se resuelve" cuando se reenvía y pasa a ENVIADO). Un plazo
   inválido usa el de por defecto, y nunca uno es menor que el anterior. `evento` no se limpia
   (no se pidió; sigue en la lista de "tablas que crecen").
2. **Roles a los módulos**: se hizo (no rompía más de lo que arreglaba). `membresia.rol` pasó de
   enum a texto con forma (`^[A-Z][A-Z_]{1,29}$`, CHECK en la base); qué roles existen lo valida
   el registro (al arrancar: todo `rolesPorDefecto` nombra uno que existe) y el back office (al
   asignar). PUERTA lo declara la ticketera; COMERCIAL, tienda y ticketera (mismo nombre, mismo
   rol). **Cambio de comportamiento**: un PUERTA en una banda sin la ticketera ya no ve el
   resumen de la tienda ni del sitio (su rol no está vigente). Es lo que pedía la anotación ("un
   rol sin módulo no da permisos"); antes "veía" por un rol que no tenía sentido ahí.
4. **Carga de toda la plataforma** (`tests/carga/plataforma.carga.ts`, `npm run test:carga`):
   build de producción, 30 bandas con sitio publicado, tienda y ticketera, mezcla de sitio (home,
   fechas, tienda, prensa) y panel con sesión (inicio, plan y pago, tienda), 600 pedidos por
   escalón, en este contenedor (4 núcleos; app, Postgres y el cliente de la prueba en la misma
   máquina). Tres corridas, mismos números:

   | a la vez | pedidos/s | p50 | p95 | errores |
   | --- | --- | --- | --- | --- |
   | 10 | 55 | 135 ms | 344 ms | 0 |
   | 25 | 61 | 297 ms | 722 ms | 0 |
   | 50 | 67 | 541 ms | 1,3 s | 0 |
   | 100 | 66 | 1,1 s | 2,6 s | 0 |
   | 200 | 63 | 2,4 s | 5,3 s | 0 |
   | 400 | 67 | 4,6 s | 8,6 s | 0 |

   **El techo es ~65 pedidos por segundo por proceso de la app**, y lo pone la CPU de Node (un
   hilo al 100 %; Postgres queda en ~40 % de un núcleo). De a uno, cada página tarda 15–45 ms
   (el inicio del panel, el más caro: una consulta por módulo). Pasado el techo nada se rompe:
   ningún error en ningún escalón, solo cola (a 100 simultáneos el p95 ya pasa 2 s). Para más:
   más CPU primero; más réplicas de la app después, revisando antes el bus de eventos (el orden
   por banda lo cuida una cola en memoria de cada proceso, `src/nucleo/eventos/bus.ts`). Lo demás
   que vive en memoria aguanta varias réplicas: el freno por IP de la autogestión cuenta por
   proceso, las tareas periódicas son idempotentes, y evento y correo se "toman" en la base. La apertura de venta tiene su propia
   prueba (`compras.test.ts`, `http.carga.ts`) y no cambió.
5. El staff puede asignar un rol cuyo módulo está apagado (se ve "(módulo apagado)"): sirve para
   dejar armado el equipo antes de prender la ticketera.

## A1 · Barrido de pendientes

1. **Cada cuánto**: al arrancar y cada 60 s (`DEOCO_BARRIDO_SEGUNDOS`, mínimo 5). Barato: una
   consulta que devuelve solo las bandas con algo pendiente.
2. **Solo en producción** (`instrumentation.ts` ya corre solo ahí). En desarrollo lo pendiente
   sale como antes, cuando la banda hace algo.
3. **Eventos FALLIDOS no se reintentan solos**: siguen siendo para reprocesar a mano desde el
   back office (lo que ya estaba). El barrido solo retoma PENDIENTES. Un suscripto que falla
   suele fallar de nuevo; reintentarlo solo llenaría `fallos`.
4. **Correo FALLIDO sí se reintenta solo**, dos veces (2 y 15 min después). Un SMTP caído un
   rato es lo más común; después del 3.er fallo queda para reintentar a mano.
5. **Correo colgado en ENVIANDO** (el proceso murió mientras salía, >15 min): queda FALLIDO
   **sin** reintento automático. No se sabe si llegó; ante la duda, mejor uno que no llega
   (y se reintenta a mano) que uno duplicado. El pedido dice "que no procese dos veces".
6. **No procesar dos veces** entre procesos (un deploy que se solapa): evento y correo se
   "toman" en la base con un update condicional. Un evento tomado por otro proceso hace
   menos de 10 min no se toca, y no se adelanta el siguiente de esa banda (se respeta el orden).
   Dentro de un proceso, el barrido usa las mismas colas por banda que el pedido.

## A2 · Revisión de dominios

1. **Cada 6 horas**, por dominio propio verificado. Solo el registro **A** (que apunte a la IP
   del servidor). El TXT no se vuelve a exigir: ya probó la propiedad, y mucha gente lo borra
   después de verificar.
2. **Dos revisiones seguidas** sin apuntar para marcarlo (una sola puede ser un DNS que tarda
   o falla un rato). Se desmarca solo en la primera revisión que apunte.
3. **Quién ve el aviso**: el titular (el que puede arreglarlo), arriba de todas las
   pantallas del panel, más la marca en la lista de dominios (panel y `/admin`, donde lo ve el staff). No se manda
   correo (no estaba pedido).
4. **Si no se sabe la IP** del servidor (sin `DEOCO_IP_PUBLICA` y sin DNS de `app.<raíz>`), no
   se revisa nada (aviso en el log): mejor no marcar que marcar todo mal.

## A3 · Rotación de la clave de secretos

1. **Dos claves a la vez** durante la rotación (`DEOCO_CLAVE_SECRETOS_ANTERIOR`): así no hay
   corte, ni hace falta apagar la app. Se cifra siempre con la actual.
2. **Script en la consola** (`node scripts/rotar-clave-secretos.mjs`, con el rol dueño como
   `crear-staff.mjs`), no una pantalla del back office: es una operación de servidor, rara,
   y la clave no debería pasar por un formulario.
3. **Todo o nada**: si una credencial no abre con ninguna, no se recifra ninguna. Mejor un
   estado único (todas con la misma clave) que uno mezclado.
4. El script repite el formato de `src/nucleo/secretos/cifrado.ts` en JS (la imagen no trae
   `tsx`); una prueba cifra con el núcleo, rota con el script y lee con el núcleo.

## B · Consultas entre módulos

1. **Por id con texto** (`"ticketera.proximas-fechas"`), sin tipos compartidos: un módulo no
   importa código de otro, tampoco tipos. Quien pregunta valida la forma con `interpretar`
   (obligatorio) y la forma se documenta junto a la declaración.
2. **Errores y demoras → vacío** (3 s por defecto), además del módulo apagado. "Nunca rompe a
   quien pregunta" lo tomé literal: un sitio no se cae porque la ticketera falla.
3. **Respuesta JSON y copiada**: así nadie comparte objetos ni se cuelan clases o funciones.
4. **Solo lectura.** No hay "comandos" entre módulos: para avisar algo están los eventos.
5. Quien pregunta **no declara** que usa una consulta (no hacía falta para nada concreto; se
   puede sumar si se quiere validar al arrancar).

## C · Panel del proveedor

1. **Toqué el núcleo, de forma genérica.** Un módulo no puede tener pantallas en `app.<raiz>`
   para alguien que no es staff ni de una banda, ni leer entre bandas: eso es del núcleo. Lo
   resolví como capacidad genérica ("cuentas externas", el núcleo no sabe qué es un
   proveedor), igual que antes con `rutasAdmin`. Revisalo contra la regla "no toques el núcleo
   para resolver algo de un módulo".
2. **Lectura entre bandas por RLS**, no con funciones SECURITY DEFINER: la base garantiza que
   el proveedor solo ve sus filas (políticas SELECT `proveedor_lee`). Escrituras en la banda de
   la orden con el proveedor en el WHERE (atómicas con el evento).
3. **Una orden por (pedido, proveedor)** (tabla `tienda_orden`), aparte de la deuda: estado
   de producción y plata son cosas distintas. Las ya pagadas se migraron desde la deuda.
4. **Pedido con dos proveedores**: pasa a DESPACHADO cuando despachan **todos**; el fan recibe
   un mail por cada paquete ("Una parte de tu pedido ya salió" / "El resto…").
5. **No hay ENTREGADO**: el proveedor no tiene cómo saberlo (lo sabe el correo). No lo inventé.
6. **Link de impresión**: en vez de un botón "pedir link nuevo", el detalle de la orden arma
   uno nuevo cada vez que se abre (vale 3 días). El mail al proveedor ahora dice eso y trae el
   link al panel (antes decía "pedile uno nuevo a la banda").
7. **Saldar**: solo el proveedor, desde su cuenta corriente (marca una o varias, con nota). La
   función que existía para que lo marcara la banda (sin pantalla) se quitó. La banda lo ve.
8. **Contacto de la banda** en la orden: el de la tienda o, si no cargó uno, el mail de un
   titular (lo mismo que ya llegaba por mail al proveedor).
9. **Una persona del staff no puede ser cuenta externa**; un usuario existente sin staff sí
   (se vincula sin clave nueva). Varias personas por proveedor, sí.
10. **Nombre de la banda copiado en la orden** (`bandaNombre`): el proveedor no lee la tabla de
    bandas. Si la banda cambia de nombre, las órdenes viejas muestran el anterior.

## D · Ticketera: el pago

1. **El cobro pasó al núcleo** (`src/nucleo/pagos`). "Reusá el flujo de pago, no lo dupliques"
   + "un módulo no importa código de otro" solo cierran si la pasarela es del núcleo. Es
   genérico (ningún módulo nombrado); tienda y ticketera lo usan igual.
2. **Credenciales de cobro, una por banda** (Credenciales → Cobros), no una por módulo: el
   titular carga el token una vez. Se guardan en `secreto` con módulo `pagos` (id reservado).
   Las ya cargadas en la tienda se mueven con `scripts/mover-credenciales-de-cobro.mjs` (o el
   titular las vuelve a cargar).
3. **El aviso sigue siendo de cada módulo** (`/avisos/<banda>/<modulo>/pago/<pasarela>`): el
   núcleo consulta el cobro a la API y el módulo lo registra. Así la URL de la tienda no cambió.

## D · Ticketera

1. **Una compra = un tipo de entrada** (y una cantidad, hasta 10). Para dos tipos, dos compras.
2. **Precio mayor a cero**: no hay entradas gratis (la pasarela no cobra $0). Si hace falta,
   se agrega un flujo sin pago.
3. **Cupo en la base**: `ticketera_tipo.ocupadas` (vendidas + reservadas vigentes) con
   `CHECK (ocupadas <= cupo)` y la fila bloqueada en cada compra. Probado con 8 compras a la vez
   para 5 lugares.
4. **Reserva de 20 minutos** mientras el fan paga. Vence sola (se libera al intentar otra compra
   del mismo tipo; no hace falta un proceso aparte). Si paga después de vencida: entra si todavía
   hay lugar; si no, la compra queda "a revisar" y la banda devuelve el pago desde su pasarela.
5. **Monto distinto** → "a revisar" y libera el lugar. Pago duplicado → anotado en la compra,
   visible en el panel, para devolver. Deoco no devuelve nada.
6. **Las entradas se crean al pagarse** (no antes): un QR nunca existe sin pago.
7. **Código de 10 caracteres** sin letras confusas (0/O/1/I), único por banda, en el QR y para
   tipear. La página de las entradas pide un token aparte (`?t=`), porque deja entrar.
8. **Mala señal en la puerta**: elegí la forma más simple que nunca deja entrar dos veces: decide
   siempre el servidor (cambio condicional). El teléfono reintenta solo el mismo intento con un
   id: si la primera llegó y se perdió la respuesta, el reintento dice "PASA" y no "ya entró".
   **Sin conexión no hay verde** (dice "Sin señal: reintentando" y "no lo dejes pasar"). No hice
   un modo sin conexión con la lista descargada: con dos puertas, dos teléfonos sin señal
   podrían dejar pasar la misma entrada. Si hace falta, se puede sumar con una sola puerta
   "dueña" del show.
9. **Escaneo** con la cámara y jsQR (anda en Android y iPhone; la cámara pide https). Siempre se
   puede tipear el código.
10. **Rol PUERTA**: solo la pantalla de puerta (ni ventas ni compradores). El titular también
    valida. Editar shows: titular, editor y comercial.
11. **Pestaña "Fechas" de la ticketera** (`/fechas`): la pone la ticketera, no el sitio. La home
    del sitio muestra los próximos shows de la ticketera (con "Entradas" a `/fechas/<id>`) si
    está prendida, aunque no haya ninguno; apagada, las cargadas a mano (que se guardan). La
    vista previa del panel del sitio sigue mostrando las cargadas a mano.
12. **Mail con los QR como imágenes embebidas** (`cid:`): sumé adjuntos al correo del núcleo
    (genérico, hasta 30 y 1 MB). Los servicios de correo bloquean imágenes `data:`.
13. **Shows a la vista hasta 6 h después de empezar** (la noche del show sigue en Fechas y en la
    puerta).

## G1 · Apertura de venta y token

1. **Pool 40, esperar 10 s, transacción 15 s.** Postgres trae 100 conexiones: 40 de la app + 5 del
   back office dejan lugar para migraciones, consola y las reservadas. Una compra son transacciones
   de milisegundos: 40 alcanzan para miles por segundo. Esperar 10 s (no 2) porque en un pico es
   mejor que el fan espere a que reciba un error. Se cambia con `DEOCO_DB_CONEXIONES`.
2. **Caché por pedido** (`cache` de React) solo para lecturas: módulos prendidos + nombre de la
   banda, credenciales de cobro, y en el sitio el show y el producto. El panel lee sin caché el
   show (después de guardar, se ve lo nuevo).
3. **Lo que no es "agotada" ni un dato mal cargado** se muestra como "Hay mucha gente comprando en
   este momento. Probá de nuevo en unos segundos." (si es carga) o "No pudimos completar la
   operación…" (si no). El detalle va al log.
4. **Acceso a entradas y pedidos con una cookie del sitio de la banda** (httpOnly, un año, solo ese
   sitio) + link del mail con el token después de "#". Elegí esto antes que "la vuelta del pago
   no muestra nada": quien compró ve sus entradas al volver de la pasarela, en el mismo navegador,
   sin que el token pase por un tercero. Es la única cookie de los sitios públicos y no es una
   sesión: da acceso a esa compra y nada más.
5. **La prueba de carga por HTTP** (`npm run test:carga`) no corre con `npm test`: incluye un
   `next build`. En este contenedor, 300 cargas a la vez de la página del show dan p95 ≈ 5 s
   (CPU del contenedor, no la base); en el servidor de verdad hay que medirlo (lista de
   verificación).

## G2 · Aislamiento del proveedor y migraciones

1. **Cuenta externa en una banda** sin abrir la banda: variables propias (`app.externo_*`) y
   políticas que la nombran. Lo que no tiene política para ese contexto, no existe.
2. **El módulo decide con funciones SQL de nombre fijo** (`<id>_externo_banda`,
   `<id>_externo_archivo`) que el núcleo llama sin conocerlo. Sin la función, no.
3. **Columnas por disparador**: Postgres no restringe columnas por contexto en una política;
   el disparador compara la fila sin las columnas permitidas.
4. **El estado del pedido lo mueve la base** (disparador SECURITY DEFINER, como dueña): así el
   proveedor no necesita escribir pedidos.
5. **El contacto de la banda en la orden es una copia al pagarse** (como `bandaNombre`). Si la
   banda carga un contacto después, se ve el nuevo (la tienda lo deja leer); si no, la copia.
6. **La migración vieja de `tenant` no se borra**: puede estar aplicada en producción y Prisma
   compara checksums. La del núcleo la reemplaza (borra la política y la crea con dueño claro).
7. **Agujero encontrado acá:** `usuario` no tenía RLS. Arreglado en G2b (abajo).

## G2b · `usuario` con RLS

1. **La persona, por una variable propia** (`app.usuario_id`, la fija `conUsuario()` del núcleo con
   el id de la sesión). No reusa `app.tenant_id`: una persona no es de una banda.
2. **`esStaff` por privilegios de columna, no por política**: deoco_app no tiene UPDATE sobre
   `esStaff` ni `email`, ni INSERT ni DELETE en la tabla. Ninguna variable de sesión lo habilita;
   solo el back office (deoco_admin) o SQL a mano.
3. **Las altas del staff (cuentas externas) por funciones SECURITY DEFINER** que exigen
   `app_es_staff()` y crean siempre sin staff y con clave temporal. El staff no lee la tabla: ni
   en conStaff (ahí corre código de módulos).
4. **Lectura de staff sin auditoría** (`leerComoStaff`): listar quién entra a un portal no cambia
   nada; auditar cada vista llenaría la tabla. Escribir sigue siendo `conStaff` (auditado).
5. **El contacto de la tienda** sigue cayendo en el mail del titular si la banda no cargó uno, pero
   lo pide al núcleo (`titularDeBanda`, solo de su banda) en vez de leer `usuario`.
6. **Login**: la función devuelve id + hash (lo mínimo para verificar con argon2 en la app). Quien
   tenga la conexión de la app puede pedir el hash de un email; es lo mismo que necesita el login
   y no da más que eso.

## G3 · Lo duplicado

1. **El registro del pago es del núcleo; qué se cobró, del módulo.** `CosaACobrar` son seis
   funciones chicas; el orden de las comprobaciones y los duplicados no se pueden reescribir.
2. **Pago duplicado: una tabla del núcleo** (`cobro_duplicado`), sin FK a la fila del módulo (el
   núcleo no conoce sus tablas). Ninguna cosa cobrada se borra hoy; si un módulo empieza a borrar,
   que limpie sus duplicados.
3. **Responder-a por defecto, el titular.** Mejor un mail que le llega a la banda que uno que
   le llega a Deoco por olvido.
4. **Quedó repetido a propósito:**
   - ~~`conEdicion`~~: unificado en G3b (`accionesDelPanel` + `edicion` en el contrato).
   - Los `Intl.DateTimeFormat` de cada pantalla: cada una elige cómo mostrar la fecha; la zona
     es siempre la misma y no hay lógica que pueda divergir.
   - El regex de UUID (13 copias): es un formato fijo, no una regla de negocio.
   - El estilo en línea de los mails (tienda y ticketera): es la cara de cada mail; si se
     quiere una plantilla común de mails, es una decisión de diseño, no un arreglo.
   - `conPuerta` de la ticketera: otro permiso y otra forma de error (la puerta no es un formulario).
   - Las variables CSS del marco (`variables()` del sitio): las define el sitio, que es quien da
     el marco; el núcleo solo documenta los nombres y las lee con valor por defecto.

## G3b · Formularios del panel

1. **`edicion` va en el contrato, no en el archivo de acciones**: el archivo de acciones se
   carga con el primer pedido que lo usa; el contrato, al arrancar. Así un permiso mal escrito
   o de otro módulo hace que el servidor no arranque (`ErrorRegistro`), en vez de dar "sin
   permiso" en silencio.
2. **Uno por módulo.** Si un módulo necesita formularios con otro permiso (la puerta de la
   ticketera), usa `exigirPermiso`/`puedeEnPedido` como antes; la prueba de permisos escritos
   revisa que existan.

## Bloque 4 · Anotado, sin arreglar

### 1. Roles PUERTA y COMERCIAL en el núcleo

> **Hecho en P4** (ver "P4 · Endurecimiento"). Queda como registro de lo que se analizó.

**Dónde están.** `enum Rol` de `prisma/schema/nucleo.prisma` (TITULAR, EDITOR, COMERCIAL,
PUERTA, LECTURA), las listas de roles del back office (`src/app/admin/bandas/[slug]/page.tsx`,
`src/app/admin/_servidor/bandas.ts`) y la tabla de roles de la spec del núcleo
(`docs/spec/00-especificacion-nucleo.md`). PUERTA solo tiene sentido con la ticketera;
COMERCIAL, con la tienda o la ticketera. El núcleo los conoce aunque no conozca los módulos.

**Por qué no molesta hoy.** Un rol no da nada por sí mismo: los permisos los declara cada módulo
con `rolesPorDefecto`. Un PUERTA en una banda sin ticketera solo tiene lo que otro módulo le
dé (hoy, ver el resumen del sitio): el rol existe, pero no abre nada.

**Qué costaría sacarlos** (los roles pasan a ser datos que declaran los módulos):
- Contrato: `roles: [{ clave, etiqueta, descripcion }]`; el núcleo se queda con TITULAR, EDITOR
  y LECTURA (los de la spec que no son de negocio). Regla para un rol que declaran dos módulos
  (COMERCIAL, tienda y ticketera): el mismo nombre es el mismo rol, con la etiqueta del primero.
- Base: `membresia.rol` de enum a texto (migración con `ALTER TYPE … USING`), y una
  comprobación al asignar (el back office valida contra el registro, no la base).
- Registro: `rolesPorDefecto` solo puede nombrar roles del núcleo o declarados por algún módulo.
- Back office: el selector de roles sale del registro. Una membresía con un rol cuyo módulo se
  apagó o se quitó: se ve como "rol sin módulo" y no da permisos.
- Cambiar la spec del núcleo (la tabla de roles).
- Tamaño: ~15 archivos (contrato, registro, permisos, resolver, back office, tres módulos, las
  pruebas de permisos y de módulos), una migración. Un día de trabajo con pruebas. No hay
  datos que migrar más que el tipo de la columna.
- **Cuándo:** cuando aparezca un módulo que necesite un rol nuevo. Antes, no paga.

### 2. `cabeceraPublica` y `cobros` con forma de tienda

- ~~**`cabeceraPublica`**: la aportaba **un solo módulo**~~ → resuelto en G5: uno por módulo,
  en fila por `orden` (`{ componente, orden }`; la tienda, 10).
- **`cobros`**: el `Cobro` que recibe `crearCobro` tiene `items` + `extras` (los extras son los
  envíos de la tienda) y un `comprador` con nombre y email. Para entradas sirve (un ítem, sin
  extras), para una suscripción o una seña no. El aviso está fijo en `/pago/[pasarela]` (uno por
  módulo). Desde G3 la parte de **registrar** el pago ya es genérica (`CosaACobrar`); lo que
  queda con forma de tienda es **crear** el cobro. Arreglo cuando haga falta: `extras` pasa a
  ser "renglones sin cantidad" con nombre neutro, y un módulo podría declarar más de un tipo de
  cobro con su propia ruta de aviso. No hay segundo caso hoy: no paga.

### 3. `moduloId = "pagos"` reservado

- Las credenciales de cobro son del núcleo, pero la tabla `secreto` está indexada por
  `moduloId`: se guardan con `moduloId = "pagos"` (`ID_COBROS`, `src/nucleo/pagos/index.ts`), y
  por eso el registro reserva los ids `pagos` y `nucleo` (`ID_RESERVADOS`). El cifrado está
  atado a banda + `"pagos"` + clave (dato adicional de AES-GCM).
- Costo de que quede así: ningún módulo se puede llamar `pagos`. Nada más.
- Costo de cambiarlo: una columna `ambito` (`nucleo` | `modulo`) en `secreto`, y recifrar las
  credenciales de cobro con el contexto nuevo (como `scripts/mover-credenciales-de-cobro.mjs`).
  Una migración + un script de una vez + la prueba de secretos. **No lo haría**: el nombre
  reservado es honesto y está validado.

### 4. Tablas que solo crecen

Hoy nada se borra. Las que crecen con el uso:

| Tabla | Una fila por | Tamaño aprox. | Para qué se necesita después |
| --- | --- | --- | --- |
| `correo` | mail (compra, despacho, orden al proveedor) | 5–10 KB; **el de entradas, hasta ~30 KB** (cada QR es un PNG de ~1,6 KB, ~2,1 KB en base64, hasta 10 por compra, más el html) | reintentos (FALLIDO), soporte ("¿me llegó?") unos días |
| `evento` | venta, pago, despacho… | ~0,5–1 KB | entrega y reproceso; la clave única (`claveUnica`) evita repetir durante los reintentos de la pasarela |
| `auditoria` | acción del staff; acceso del staff a un panel (una cada 10 min) | ~0,5 KB | es la auditoría: **no se limpia** |
| `cobro_duplicado` | pago de más | chica | la banda tiene que devolverlo: no se limpia |

Con 10.000 compras de entradas, `correo` son ~300 MB, casi todo base64 de QR que ya salió.

**Propuesta** (una tarea más del barrido, una vez por día, en tandas de 5.000 filas para no
bloquear):
1. `correo` ENVIADO hace más de **7 días**: vaciar `adjuntos` (`[]`). El QR se puede volver a
   ver en la página de la compra; el mail ya salió.
2. `correo` ENVIADO hace más de **90 días**: vaciar `html` y `texto` (quedan para quién, qué
   asunto, cuándo y estado). Borrar la fila a los **365 días**.
3. `evento` PROCESADO hace más de **90 días**: borrar. Es mucho más que la ventana en la que
   la pasarela reintenta un aviso (días), así que la clave única ya no hace falta; y un aviso que
   llegara igual no vuelve a cobrar nada (`registrarCobro` cambia el estado una sola vez).
4. Nunca: lo FALLIDO o PENDIENTE (alguien tiene que mirarlo), `auditoria`, `cobro_duplicado`.
5. Medirlo antes de decidir los plazos: `SELECT pg_size_pretty(pg_total_relation_size('correo'))`
   una vez por mes los primeros meses (está en la lista de verificación).

