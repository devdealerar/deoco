# Tareas

## A · Auditoría contra el documento maestro

Documento maestro: `docs/documento-maestro.md`. Auditoría: `docs/auditoria-documento-maestro.md`.

### A1 · Bloque crítico ✅

- 9.16: PUERTA solo valida (sin `tienda.producto.ver` ni `sitio.contenido.ver`). `tests/roles.test.ts`
  exige que el único permiso con PUERTA sea `ticketera.puerta.validar`.
- 14.3: con la banda SUSPENDIDA o ARCHIVADA, la puerta sigue para los shows con entradas vendidas
  que no terminaron. Genérico: `conBandaCerrada` en las rutas de panel del contrato; el proxy deja
  pasar las rutas de módulo marcadas y `accesoPanel` decide con la ruta del pedido y la de quien
  llama (`src/nucleo/acceso/banda-cerrada.ts`). Pruebas: `tests/banda-cerrada.test.ts`,
  `tests/proxy.test.ts`, e2e en `tests/e2e/ticketera.e2e.ts`. El plazo de suspensión no se tocó.
- 9.11: QR firmado (`modulos/ticketera/firma.ts`): 10 al azar + 10 de HMAC por banda con
  `DEOCO_CLAVE_QR` (`entorno` en el contrato, lo exige el arranque). La puerta verifica antes de
  tocar la base; los códigos de 10 caracteres sin firma se siguen buscando (transición).
  `tests/ticketera-qr.test.ts`.
- 7.32: `tienda_pedido_item.disenoId` (migración `tienda_item_diseno`): el portal y el mail al
  proveedor usan el diseño del renglón; la política del proveedor sobre `tienda_diseno` mira sus
  renglones. Los renglones viejos toman el diseño actual de su producto.
- 7.33: duplicar un producto (`duplicarProducto`, botón en el producto; la foto se copia con
  `leerArchivo` del núcleo).
- 6.1: las fechas cargadas a mano conviven con los shows de la ticketera (misma fecha y sala: una
  vez, la de la ticketera).
- 7.31: resuelto en B5.

### B · Segundo bloque (fuente de verdad: `docs/decisiones-3.2-respondidas.md`)

- B0 ✅ Archivos del panel con permiso por recurso (`archivo.recurso`, `accesoAlArchivo`: 403 sin
  el permiso del recurso, 404 si no existe). `tests/archivos-permiso.test.ts`.
- B1 ✅ Escalera de mora 0/3/15/30/60/90 (MOROSO, MOROSO_GRAVE, SOLO_LECTURA, SUSPENDIDO,
  ARCHIVADO), plazos en `comercial_config`; pagar restaura todo. Las ventas en curso (entradas y
  pedidos ya comprados) siguen con la banda cerrada (`conBandaCerrada` en rutas públicas).
- B2 ✅ Los topes se quedan; el almacenamiento es red de seguridad. Bajar de plan nunca despublica
  shows (ventas en curso). Medición de uso por banda (`mediciones`, `/admin/bandas/<slug>`).
- B3 ✅ La banda elige el proveedor: `tienda_oferta` (producto base × proveedor, costo, envío,
  plazo); fijo con un pedido pagado (se duplica); oferta retirada no se elige en productos nuevos.
  `tests/tienda-ofertas.test.ts`. Preparado para el directorio de proveedores (cada proveedor con
  sus ofertas).
- B4 propuesta, sin construir (pago de la banda al proveedor).
- B5 ✅ Arte inmutable después de un pedido pagado (`tienda_diseno.reemplazaAId`) + historial.
- B6 no se construye: informe del modelo usuario/banda (td2), en `docs/decisiones-pendientes.md`.
- Segunda vuelta de auditoría contra el 3.2: `docs/auditoria-3.2-segunda-vuelta.md` (175 requisitos;
  hallazgos mal construidos en su §5, conflictos para decidir en su §6). Arreglado de paso: textos de
  la cuota que seguían prometiendo "el sitio sigue online".

### C · Lo que pierde plata y lo que no se recupera ✅

C1 (cada punto con su prueba):
- C1.1 Cambiar de plan nunca corta lo vendido ni lo abierto: un módulo con algo en curso
  (`enCurso` del contrato, devoluciones pendientes incluidas) queda prendido como excedente
  (`moduloTenant.excedenteDesde`) y se cobra el plan que lo cubre hasta que cierra. Mismo patrón
  en apagar módulos (staff). `tests/cuenta.test.ts`, `tests/comercial.test.ts`.
- C1.2 Conciliación con la pasarela: tienda (`conciliarPedidos`), ticketera (`conciliarCompras`) y
  cuota (`conciliarCuota`, antes de subir un escalón). Un pago aprobado cuyo aviso se perdió se
  registra igual.
- C1.3 Vencimientos: pedido de tienda a los 7 días o al dejar de estar a la venta; compra de
  entradas al cerrar la preventa o al empezar el show (lo primero). Pago tardío → no se acepta y
  queda para devolver.
- C1.4 Duplicados siempre registrados; pantalla `/b/<slug>/devoluciones` con aviso en el panel.
- C1.5 Contracargos y devoluciones cambian el estado (`alDevolverse`): las entradas dejan de valer
  en la puerta (`anuladaEn`); un pedido ya producido queda marcado para resolver con el proveedor.
- C1.6 Archivada: la suscripción se cancela en la pasarela (`cancelarDeArchivadas`); `/pago` sigue
  abierto para el titular (darse de baja o volver).
- C1.7 `auditoria` inmutable para `deoco_app` (REVOKE + disparador); pantallas en `/admin/auditoria`
  y `/b/<slug>/actividad`; cada guardado del panel de un módulo queda registrado.
- C1.8 Acaparamiento de entradas: reserva de 10 min, 6 por compra, 12 por email y show, 2 reservas
  abiertas por email y 4 por IP (`ipHash`). **Números propuestos, para revisar.**
- C1.9 El subdominio no cae con un dominio propio roto: solo se redirige al principal si está sano.
- C1.10 Datos fiscales y país de destino desde la primera venta (`@/nucleo/fiscal`, foto por venta).

Decisiones aplicadas: B3 según el 3.2 (despublicar + reasignar en un clic, lo pagado se produce);
plazos del crédito B4 en la base por proveedor (`docs/decisiones-pendientes.md`); planes del 3.2
(Demo y Escenario a la venta, Gira y Sello cerrados, prorrateo al subir; `docs/planes.md`); grilla
de espacio 1,5 / 10 / 36 GB por la cuenta de los siete años.

C2: copias diarias fuera del VPS, restauración probada (contra la base de pruebas) y monitoreo:
`docs/copias-y-monitoreo.md`. **No se contrató nada**: propuesta Backblaze B2 + Better Stack +
Healthchecks.io, USD 0 a 2 por mes al arrancar. Falta la restauración de verdad en el VPS.

C3 (menores del §5 de la segunda vuelta):
- Tokens del fan: hash para comprobar y cifrado para el link (nunca en claro).
- Compartimentos de conexiones por banda (`DEOCO_DB_CONEXIONES_POR_BANDA`, `ErrorBandaOcupada`).
- Sesiones: `usuario.versionSesion` (cambiar la clave o "Cerrar sesiones" en `/admin/usuarios`).
- La baja voluntaria recibe "terminó el período que pagaste", no mails de mora.
- Archivos sin huérfanos (cuota → bytes → fila; `limpiarHuerfanos` diario); el sitio no borra al
  publicar una imagen recién subida; `DEOCO_LIMITE_ALMACENAMIENTO` validado al arrancar.
- Lo que el staff cambia en un producto base llega a los productos (`tienda_base_cambiada`).
- Menores del §5.18: el pedido conserva el proveedor cuyo envío pagó el fan; la puerta no abre
  shows pasados o en borrador; el inicio no corta pendientes en silencio. ("Envío incluido" en el
  esquema ya estaba corregido.)

C4 (casos de borde del núcleo, 3.2 núcleo d6):

| Caso | Estado | Dónde |
|---|---|---|
| Tope de entradas con la venta abierta | No hay tope de entradas: nunca se corta, pero tampoco se factura ni se sugiere subir | `docs/planes.md` |
| Tope de almacenamiento | OK: se bloquean cargas, no se borra nada | `tests/archivos.test.ts` |
| Baja con más productos que el tope | OK: borrador por orden inverso de creación | `tests/comercial.test.ts` |
| Baja con dominio propio | OK: redirige al subdominio, el dominio sigue de la banda, no suma nuevos | `tests/dominios.test.ts` |
| Sube a mitad de período | OK: límites ya, diferencia proporcional en el próximo cobro | `tests/comercial.test.ts` |
| Evento puntual que excede el plan | FALTA: no hay complementos sueltos | |
| El titular se va | OK: la base impone que nunca quede sin titular; pasar la titularidad y dejar la banda desde `/b/<slug>/equipo` | `tests/equipo.test.ts` |
| Conflicto interno | PARCIAL: una persona titular no saca ni baja a otra desde el panel, pero puede haber varias titulares y no hay "titular registrado" único | |
| Usuario revocado con sesión abierta | OK: membresía (rol por pedido), clave o "Cerrar sesiones" | `tests/equipo.test.ts`, `tests/e2e/sesiones.e2e.ts` |
| Un manager pierde la representación | OK lo de la banda (la saca desde Equipo); el módulo `manager` no existe | |

### Bloque D · Cerrar la fase 2 (trabajo sin supervisión; decisiones en `docs/decisiones-pendientes.md`)

- D0 ✅ Un solo titular registrado por banda (índice único `membresia_un_titular`); los demás
  pasan a GESTOR (el más antiguo queda) con mail. Acaparamiento configurable por show
  (`ticketera_evento`: frenos, tope absoluto 20). `tests/equipo.test.ts`, `tests/ticketera-*.test.ts`.
- D1 ✅ Cuota: el rechazo reintenta antes de la mora (la escalera cuenta desde el vencimiento).
  Topes por mes (`shows-por-mes`, `entradas-por-mes` solo mide, `imagenes`), `limite_extra`;
  complementos sueltos (staff los define en `/admin/m/comercial/complementos`, la banda los compra
  en `/pago`; sugerencia del plan que cubre el excedente de entradas: facturarlo, pendiente).
  "Resuelto con el proveedor" y renglón `fueraDeCatalogo`. `tests/complementos.test.ts`.
- D-infra ✅ Copia local diaria 7 días (`infra/copias`), discos de tamaño fijo
  (`infra/disco/volumenes.sh`, sin correr) + reserva libre (`DEOCO_ARCHIVOS_RESERVA_MB`), pasos de
  Backblaze en 15 min. Exportación completa (`/b/<slug>/exportar`, zip CSV + JSON + archivos, en
  segundo plano, mail, vence a 7 días, abierta en todo estado). `tests/exportacion.test.ts`.
- D2 ✅ Legal y privacidad (`src/nucleo/legal`): cookies con registro y revocación, política y
  términos del sitio generados y versionados, términos de Deoco y encargo de tratamiento aceptados
  y registrados, derechos del fan (acceso, rectificación, supresión, arrepentimiento) con plazos
  hábiles. `docs/privacidad.md` ("a consultar con abogado"). `tests/legal.test.ts`, `tests/e2e/legal.e2e.ts`.
- D3 ✅ Suplantación segura: sesión de soporte con motivo y vencimiento (`sesion_soporte`),
  permisos de gestor, "Soporte de Deoco" en la actividad, aviso a la banda. `tests/permisos.test.ts`,
  `tests/staff.test.ts`, `tests/e2e/panel.e2e.ts` (prueba 6).

## D · Dominios de las bandas (diseño aprobado pendiente; sin código todavía)

Diseño: `docs/diseno-dominios.md` (caminos, transiciones, certificado, correo, compra).
Investigación: `docs/investigacion-dominios-correo.md`. Bloqueadores 1 (certificado) y 2
(reenvío de correo): resueltos. D1 toca lo que ya funciona (revisión de dominios, verificación,
"Usar como principal"): va primera y sola.

- D1: `src/nucleo/dominios` (`proveedor.ts` + `cloudflare.ts`: custom hostnames y zonas;
  `index.ts`: alta crea el custom hostname, verificar = hostname activo + TXT de la banda o zona
  activa, principal = certificado activo consultado en el momento, revisión cada 6 h según
  Cloudflare con `problema`), migración `dominios_cloudflare` (`via`, `proveedorId`, estados,
  `validacion`, `problemaDesde`/`problema`, `dominio_compartido()`), pantallas
  `src/app/_dominios`, aviso del marco, arranque (las dos variables de Cloudflare o ninguna).
  Se fueron el registro A, el comprobador HTTPS y `ipPublica()`. Pruebas: `tests/dominios.test.ts`,
  `tests/barrido.test.ts`, `tests/backoffice.test.ts`, `tests/e2e/dominios.e2e.ts`, con
  `tests/cloudflare-falso.ts`.
- D3: `agregarDominio(…, "zona")` crea la zona (`jump_start`: trae el DNS anterior), pone el
  sitio (`A` del dominio con proxy a `DEOCO_IP_PUBLICA`, `www` CNAME), agrega el dominio y su
  www; `.com.ar` sin registrar queda esperando; "Ya cambié los nameservers" pide
  `activation_check`; el barrido verifica solo cada 10 min (`bandas_con_zonas_pendientes`).
  Migración `dominios_delegados` (`nameservers`, `zona_de_otra_banda`). Arranque: con Cloudflare
  exige `DEOCO_CLOUDFLARE_CUENTA` y `DEOCO_IP_PUBLICA`. Quedó afuera: el mail de "listo" (el
  núcleo no tiene cómo mandar un mail propio sin un módulo; va con los avisos de D11) y el
  vencimiento de una delegación pendiente que nadie completa (ver diseño §12).
- D4: `pasarADelegado()` ("Pasarme a delegar"): prepara la zona (con lo que tenía su DNS),
  agrega lo que falte (el dominio sin www) y marca el conectado `migrandoA`; sigue andando por
  su custom hostname. Al activarse la zona pasa a `via: "zona"` (`dominio.delegado` en la
  auditoría) y el custom hostname se borra recién con el certificado de la zona activo
  (`hostnameViejo`). Vencimiento (decidido): 14 días sin cambiar los nameservers → se libera
  sola (`dominio.delegacion_vencida`); aviso en el panel desde 2 días antes
  (`delegacionesPorVencer`). Migración `dominios_transiciones` (`creadoEn`, `migrandoA`,
  `hostnameViejo`). El mail del aviso, con D11.
- D13: tercer ensayo con la imagen de producción (dominios y correo; `docs/despliegue.md`, "Qué se
  verificó"), capturas 28–37, lista de verificación con lo que solo se prueba contra Cloudflare,
  Resend, GoDaddy y Mercado Pago reales (`docs/verificacion-despliegue.md`, 9 y 14–19). Arreglos que
  salieron: la compra verifica sola la zona activa; el `www` por CNAME de un comprado no ofrece
  "pasarse a delegar"; lo que habla con GoDaddy corre aparte del barrido (`revisarComprasAparte`,
  vencimientos aparte); "Recibimos tu pago" se encola en la transacción de la compra; solo el
  gestor puede llamar a `dominioPagado`/`renovacionPagada`; para vender dominios se exige la clave
  de los avisos; una revisión de dominio que falla por Cloudflare se reintenta a los 15 min.
  Carga: `tests/carga/dominios.test.ts` (200 compras a la vez). Repaso: `docs/repaso-dominios.md`.
- Privacidad del WHOIS (decidido después de D13): incluida en el precio y activada por defecto. El
  staff fija por terminación el registro y, aparte, el costo de la privacidad (se suman; la banda ve
  un solo precio) y si la terminación la permite (`comercial_dominio_precio.privacidad`,
  `costoPrivacidad`). La compra guarda lo que se cobró (`dominio_compra.privacidad`) y registra con
  `privacy` según eso; las condiciones se piden con `privacy=true|false`. Sin privacidad en la
  terminación: se dice en la búsqueda, en el titular y en el resumen, antes de pagar. Costo de
  GoDaddy, si se activa en el registro y qué terminaciones no la tienen: SIN CONFIRMAR
  (`docs/verificacion-despliegue.md`, 20).
- D12: repaso de las cinco salidas, sin staff (`tests/salidas.test.ts`: delegado, comprado con el
  código, .com.ar, comprado solo el DNS, CNAME, y con la banda archivada). Lo que faltaba: el comprado
  que se lleva solo el DNS (`ponerMisNameservers`: Deoco pone los nameservers de su proveedor nuevo,
  operación `dns`; al irse la zona queda `soloRegistro`; a los 90 días sin nameservers la salida se
  cancela sola; "me quedo" vuelve a poner los de Deoco). Migración `comprado_dns_afuera`. E2e en
  `tests/e2e/compra-dominio.e2e.ts`. "Transferir a Deoco" queda pendiente (decisiones-pendientes, D12).
- D11: `vencimiento.ts` (calendario 45/30/15/7/3/1 por mail con `unica`, aviso fijo en el panel
  desde 30 días, vencer → subdominio y remitente Deoco, gracia 30 días, pérdida si el registrador lo
  libera; `fijarVencimiento` para delegados), `transferencia.ts` (código en el panel, bloqueo de 60
  días, detección de la salida → delegado), `plazos.ts`. Renovar: `pagarRenovacion` (cualquier
  estado de la banda, gracia) + botón en la tarjeta; renovación que no se puede hacer → devolución.
  Cambio de titular: `cambiarTitularRegistral` (tipo `titular` en la máquina). La tarjeta de cada
  dominio muestra los tres renglones fijos del diseño. Barrido: vencimientos y transferencias, una
  vez por hora. Migración `dominio_vencimiento`. Pruebas: `tests/dominios-vencimiento.test.ts`, e2e
  en `tests/e2e/compra-dominio.e2e.ts`.
- D10: pantallas de compra (núcleo, solo titular): `/b/<slug>/dominios/comprar` (buscar: cada
  terminación a la venta con su precio, `buscarDominios`), `…/comprar/<dominio>` (a nombre de quién,
  precargado con quien compra; teléfono normalizado), `…/comprar/<dominio>/resumen` (precio,
  vencimiento, titular, **lo que cuesta irse, antes de pagar**, condiciones del registrador a
  aceptar todas) → Mercado Pago. Entre pasos, cookie del panel (`borrador.ts`). Progreso:
  `/b/<slug>/dominios/compras` (`seguimiento.ts`: junta el cobro del gestor y la compra; se arma de
  la base, sirve aunque se cierre la página; se refresca sola) con la corrección del dato que
  rechazó el registrador. Dominios muestra "Comprar un dominio" y las compras en marcha. Mail
  "Recibimos tu pago" con el link al progreso. "Falta un dato" vence a los 7 días → devolución
  (`vencerDatos`, migración `compra_datos`). Contrato: `dominios.terminaciones` y `.cobros`.
  Pruebas: `tests/dominios-cobro.test.ts`, e2e `tests/e2e/compra-dominio.e2e.ts`.
- D9: el cobro, en el gestor (`modulos/comercial/dominios.ts`) por `gestionaCuenta.dominios`
  (`precio`, `cobrar`, `devolver`). Núcleo: `src/nucleo/dominios/venta.ts` (`cotizarDominio`,
  `pagarDominio`, `pagarRenovacion`: disponibilidad al cotizar y otra vez antes de cobrar) y
  pagos únicos de Deoco en `@/nucleo/pagos/cuota` (`crearPagoDominio` con `binary_mode` y sin
  efectivo, cajero ni transferencia, vence a las 2 h; `consultar`, `buscar`, `devolver` con clave
  de idempotencia). Aviso propio `…/avisos/plataforma/comercial/dominio/mercadopago` (la URL va
  en cada preferencia), referencia `dominio:<banda>:<cobro>`; se consulta el pago a la API.
  Solo un pago aprobado del monto exacto arranca la compra (`dominioPagado` con el id del pago);
  uno repetido, de otro cobro de lo mismo o de otro monto se devuelve solo. Tarea periódica
  (1 min): busca los pagos de los cobros esperando (aviso perdido), arranca las compras y corre
  las devoluciones (5 min, 30 min, 2 h, 6 h, 12 h; al tercer intento "fallida", se sigue
  reintentando). Compra fallida sin registrar → `devolucion` pendiente → el núcleo se la pasa al
  gestor (pedida). Compra que no arranca en 24 h → se devuelve. Mail "Te devolvimos $X".
  Back office: `/admin/m/comercial/dominios` (precios, pagos, Reintentar ya, Marcar devuelta a
  mano con nota), aparte de "Cuotas fallidas"; `alertasAdmin` (contrato) arriba de todo el back
  office: devolución fallida, demorada (> 1 h) o compra pagada sin arrancar. Arranque: con
  registrador, exige gestor que cobre dominios y `DEOCO_CUOTA_MP_TOKEN`. Arreglo de paso: los
  mails del gestor salen desde Deoco aunque la banda tenga su dirección verificada. Migraciones
  `dominio_devolucion` y `comercial_dominios`. Pruebas: `tests/dominios-cobro.test.ts`, e2e en
  `tests/e2e/admin.e2e.ts`.
- D8: `src/nucleo/dominios/compra.ts`. Una fila por compra o renovación en `dominio_compra`
  (con el paso actual; no hizo falta separar `dominio_registro` y `dominio_paso`) y la subcuenta
  en `registrador_cliente`. Pasos del alta: cliente → registrar (sin NS) → zona → nameservers →
  activacion → principal → listo; renovación: renovar → listo. `dominioPagado()` /
  `renovacionPagada()` los llama el gestor (D9), idempotentes por `cobroId`. Cada compra se toma
  en la base (`tomadoEn`, colgada a los 5 min). Reintentos 1 min → 6 h; sin saldo, cada 15 min;
  "no disponible" falla al instante; 24 h sin registrar → `fallido` con `devolucion: "pendiente"`
  (antes mira la subcuenta: ya registrado, nunca se devuelve). Datos inválidos → estado `datos`,
  mail al titular, `corregirDatosCompra()` (la pantalla, en D10). Mails al titular: "ya es tuyo",
  "renovamos", "no pudimos registrar", "revisá un dato". Barrido: `revisarCompras`
  (`bandas_con_compras_pendientes`). `dominio.comprado`: sin quitar ni "llevarse el DNS", fuera
  del vencimiento de delegaciones. Back office `/admin/dominios`: compras con filtros (necesitan
  atención, en curso, datos, listas, fallidas; banda), Reintentar (auditado) y lo que vence en
  30 días. Al staff no le llega un mail: lo ve ahí y en el log. Migración `dominio_compra`.
  Pruebas: `tests/compra.test.ts`, e2e en `tests/e2e/admin.e2e.ts`.
- D7: `src/nucleo/dominios/registrador.ts` (interfaz `Registrador`, `ErrorRegistrador` con cinco
  tipos, `registrador()` por `DEOCO_REGISTRADOR`), `godaddy.ts` (subcuenta por banda, registro a
  nombre del titular sin renovación automática, 202 + acciones, nunca dos registros, código de
  transferencia con la subcuenta), `cola.ts` (59 pedidos por minuto, en orden). Sin pantallas ni
  cobro todavía. Arranque: registrador bien configurado y con Cloudflare. Pruebas:
  `tests/registrador.test.ts` con `tests/registrador-falso.ts`. Endpoints sin confirmar: diseño §12.
- D6: `src/nucleo/dominios/salida.ts` (`llevarseElDns`, `quedarseEnDeoco`, `revisarSalidas` en el
  barrido), `bind.ts` (archivo de zona para importar), `soltarZona` al quitar un delegado,
  `validarPorHttp`; tabla `zona_saliente`. "Cómo me lo llevo" en cada dominio (delegado: el
  botón; por CNAME: su DNS ya es suyo). Dominios queda abierto con la banda suspendida (solo
  titular). Mails: aviso de baja 7 días antes, "ya no usa los nameservers", "dimos de baja".
  Banda archivada (decidido): Dominios sigue abierto para el titular (todo lo demás, 404), el
  selector se la muestra con "Tus dominios" (`bandas_visibles`), no suma dominios nuevos.
  Pruebas: `tests/salida.test.ts`, e2e en `tests/e2e/dominios.e2e.ts` y `panel.e2e.ts`.
- D5: `src/nucleo/dominios/correo.ts` (`configurarCorreo`, `revisarCorreo`, barrido cada 10 min,
  `quitarCorreo`, `probarCorreo`), `envio.ts` (Resend), Cloudflare (`prenderRecepcion`,
  `fijarReenvio` en KV), `correo/remitente-banda.ts` (remitente de los correos de la banda),
  pantalla `/b/<slug>/correo` (ruta reservada del núcleo), Email Worker `infra/cloudflare/reenvio`
  (postal-mime; Reply-To al que escribió, tope diario, sin bucles), migración `correo_dominio`.
  Pruebas: `tests/correo-dominio.test.ts`, `tests/worker-reenvio.test.ts`, `tests/e2e/correo.e2e.ts`,
  con `tests/resend-falso.ts`.
- Correo del núcleo (adelantado de D11): `enviarCorreoDelNucleo()` (origen `nucleo`, mismo camino
  que los de los módulos: fila en `correo`, barrido, `unica`) y `avisarAlTitular()`
  (`src/nucleo/correo/deoco.ts`, remitente "Deoco", responde a `DEOCO_CUOTA_RESPONDER_A` o a
  nadie). Mails de dominios: "falta cambiar los nameservers" 2 días antes de vencer (con los
  nameservers) y "ya está conectado" al activarse una delegación; uno solo cada uno.
- Zonas que crea la app: SSL "Full" y siempre HTTPS (`ajustarZona`).
- D2 (parte de código): `ipDelVisitante()` lee `CF-Connecting-IP` (el freno del alta era el único
  lugar que leía la IP). Vuelta atrás si Cloudflare se cae: `docs/despliegue.md`.

| # | Parte | Días | Estado |
| --- | --- | --- | --- |
| D0 | Preparación única en Cloudflare (staff): fallback origin, `customers.<raíz>`, token, Email Routing, Worker y KV | — | pendiente (vos) |
| D1 | Revisión, verificación y principal según el estado de Cloudflare; `ProveedorDns` mínimo + falso; alta por CNAME | 3,5–4,5 | ✅ hecha |
| D2 | Origen detrás de Cloudflare (Traefik comodín, modo SSL) + ensayo con dominio real | 2–3 | A acotada: `aop` solo en `app.`, lista de IPs de Cloudflare en todas las rutas de Deoco, certificado de origen; ensayado con Traefik 3.6.7; YAML, pasos y vuelta atrás en `docs/despliegue.md`; **falta el ensayo con dominio real** |
| D3 | Delegar (comprado afuera y `.com.ar` asistido) | 2–3 | ✅ hecha |
| D4 | Pasar de conectado (CNAME) a delegado sin corte (el alta por CNAME ya está en D1) + vencimiento de delegaciones | 2 | ✅ hecha |
| D5 | Correo: Resend por dominio, Email Worker + KV, pantalla Correo | 4–5 | ✅ hecha |
| D6 | Salir: exportar zona, sacar de gestión sin transferir, volver al subdominio, 90 días | 2 | ✅ hecha |
| D7 | `Registrador` GoDaddy v2 + falso | 5–7 | ✅ hecha |
| D8 | Máquina de estados, tablas, barrido, back office de dominios | 5 | ✅ hecha |
| D9 | Cobro en el gestor (precios, Checkout Pro de Deoco, devoluciones) | 3–4 | ✅ hecha |
| D10 | Pantallas de compra (con el costo de salida antes de pagar) | 4 | ✅ hecha |
| D11 | Renovación y avisos; llevarse el dominio | 3–4 | ✅ hecha |
| D12 | Transferir a Deoco (delegado → comprado) | 3 | ✅ hecha (repaso de las salidas; transferir a Deoco, pendiente) |
| D13 | Punta a punta y ensayo con dominio comprado real | 3 | ✅ hecha (ensayo con la imagen y falsos; con servicios reales: verificacion-despliegue 14–19) |

## Trabajo largo · Planes, cuotas y autogestión

Resumen y lo que hay que configurar: `docs/resumen-planes-cuotas.md`.
Decisiones: `docs/decisiones-pendientes.md` (sección P).

| # | Parte | Estado |
| --- | --- | --- |
| P1 | Módulo comercial: planes, límites, cuota mensual (Mercado Pago de Deoco), estados automáticos, prueba, back office | ✅ hecha |
| P2 | Autogestión del alta (registro con email verificado, banda con subdominio, prueba o plan) | ✅ hecha |
| P3 | Inicio del panel: un bloque por módulo (consulta `inicio`) + "Para hacer" | ✅ hecha |
| P4 | Endurecimiento: limpieza de correos, roles PUERTA/COMERCIAL a los módulos, carga de toda la plataforma (techo ~65 pedidos/s por proceso) | ✅ hecha |
| P6 | Antes del despliegue: menú del back office agrupado por módulo; repaso de los textos que ven bandas y fans | ✅ hecha |
| P5 | Repaso final: todo en verde, ensayo con la imagen (alta sola → plan → cuota → venta → mora → suspensión → pago), capturas, docs | ✅ hecha (`docs/resumen-planes-cuotas.md`) |

- P1 núcleo: `@/nucleo/cuenta` (gestor de cuenta: estado, módulos, topes `limite_banda`, espacio;
  `exigirLimite` con bloqueo; `catalogoDeCuenta`), `avisosPlataforma`
  (`/avisos/plataforma/<id><ruta>`), `tareasPeriodicas` (barrido), `@/nucleo/pagos/cuota`
  (cuenta de Deoco del entorno, suscripciones de Mercado Pago: `/preapproval`,
  `/authorized_payments`). `/b/<slug>/pago` la pinta el gestor; mora y suspensión en el marco.
- P1 módulo `comercial`: `cuenta.ts` (planes, prueba, elegir/cambiar/cancelar, cobros,
  vencimientos: `decidir` es puro), `aviso.ts`, `correos.ts`, `panel/pago.tsx`, back office
  (`/admin/m/comercial`: cuentas, planes y plazos, cuotas fallidas, cuenta con Pro a medida).
  Tienda y ticketera declaran `limites` (productos y shows publicados, `publicadoEn`).
- P2: `src/nucleo/autogestion` (registro, confirmación, banda; freno por IP), migración
  `autogestion` (`registro_pendiente`, `tenant.origen`/`creadoPor`, funciones
  `registro_solicitar`, `registro_confirmar`, `crear_banda_autogestion`,
  `bandas_autogestionadas`), pantallas `/registro`, `/registro/verificar`, `/registro/banda`;
  `opcionesDeAlta` en el gestor; `/admin` filtra por alta. Pruebas: `tests/autogestion.test.ts`,
  `tests/e2e/autogestion.e2e.ts`.
- P3: `src/nucleo/inicio` (`bloquesDeInicio`, `interpretarBloque`), `src/app/b/[slug]/page.tsx`;
  `inicio.ts` en comercial, sitio, tienda y ticketera. Pruebas: `tests/inicio.test.ts`,
  `tests/e2e/comercial.e2e.ts` (inicio).
- Pruebas: `tests/comercial.test.ts` (las 8 pedidas y más), `tests/cuenta.test.ts` (núcleo),
  `tests/e2e/comercial.e2e.ts` (elegir plan → pasarela → vuelta; mora, suspensión, pago; staff).

## Trabajo largo sin supervisión

Decisiones tomadas sin consultar: `docs/decisiones-pendientes.md` (para revisar).
Componentes PRO de Untitled UI resueltos con uno propio: `docs/untitled-ui-pro.md`.

| # | Parte | Estado |
| --- | --- | --- |
| A1 | Barrido de pendientes (eventos y correos) al arrancar y periódico | ✅ hecha |
| A2 | Revisión periódica de dominios propios + aviso en el panel | ✅ hecha |
| A3 | Rotación de `DEOCO_CLAVE_SECRETOS` | ✅ hecha |
| B | Consultas entre módulos | ✅ hecha |
| C | Panel del proveedor | ✅ hecha |
| D | Módulo ticketera | ✅ hecha |
| E | Revisión final | ✅ hecha (`docs/resumen-trabajo-largo.md`) |
| F | Vista previa del sitio = sitio público (fechas de la ticketera, pestañas, cabecera) | ✅ hecha |
| G1 | Arreglos · bloque 1: apertura de venta (pool, transacciones, errores, carga) y token fuera de la URL | ✅ hecha |
| G2 | Arreglos · bloque 2: el proveedor escribe con la base como límite; política de `tenant` al núcleo | ✅ hecha |
| G2b | Arreglos · bloque 2b: `usuario` con RLS; prueba del sitio que se demoraba | ✅ hecha |
| G3 | Arreglos · bloque 3: registro del pago en el núcleo, responder-a, duplicados | ✅ hecha |
| G3b | Formularios del panel: `accionesDelPanel` + `edicion` en el contrato | ✅ hecha |
| G4 | Anotaciones (roles, cabecera/cobros, `pagos`, tablas que crecen), barrido sin archivadas, lista de verificación | ✅ hecha |
| G5 | `cabeceraPublica` en lista: uno por módulo, en fila por `orden` | ✅ hecha |
| H1 | UI hecha a mano → `@/ui` (avisos, tarjetas, pestañas, botones, color) + prueba que lo vigila | ✅ hecha |
| H2 | Back office: bandas, usuarios y eventos paginados en la base, filtro y orden en la URL | ✅ hecha |
| H3 | `db:migrate:test` sin dotenv-cli, índice de fallidos, error de hidratación de las capturas | ✅ hecha |
| H4 | Ensayo de despliegue con la imagen de producción; `/ingresar` con `@/ui`; compra de las últimas entradas | ✅ hecha |

- H1: `@/ui` suma `Pestanas` (oficial `tabs`), `Boton href`, `CampoColor`, `Aviso` con tono
  `info` (`role="note"`) y sin título, `Tarjeta` con `imagen`/`junto`/`acciones`.
  `tests/ui-propia.test.ts`: marcas de cada componente fuera de `src/ui` (sin el sitio público);
  excepciones con motivo: puerta, error global, `/ingresar`. Capturas antes/después con
  `CAPTURAS=<dir> npm run test:e2e` (`captura()` en `tests/e2e/navegador.ts`).
- H2: `src/app/admin/_servidor/listado.ts` (página, orden, `literal()` para LIKE). Bandas: SQL
  con la suma de `archivo` para ordenar por espacio; usuarios y eventos con Prisma. `Tabla` con
  `orden` + `paginacion` (base oficial de `pagination`) y `Filtros` (GET, sin parámetros
  vacíos). Pruebas: `tests/backoffice-listados.test.ts`, `tests/e2e/admin.e2e.ts` (listados largos).
- H4: ensayo completo con la imagen Docker detrás de Traefik (`docs/despliegue.md`, "Qué se
  verificó"). Bug encontrado: comprar las **últimas** entradas no llevaba a pagar (la cookie de
  acceso refresca la página, que pasa a "agotada" y desmonta el formulario que redirigía): ahora
  redirige `comprarAccion` con `redirect()`; prueba en `tests/e2e/ticketera.e2e.ts`. `/ingresar`
  con el kit (sale de las excepciones de `tests/ui-propia.test.ts`). `crear-staff.mjs` muestra el
  dominio real.
- H3: `scripts/con-entorno.mjs` corre un comando con un .env que PISA el entorno (lo usa
  `db:migrate:test`; `dotenv-cli` fuera: su comando `dotenv` chocaba con el de `dotenv`). Índice
  parcial `evento_fallido` (fecha, id) WHERE FALLIDO: contar fallidos ya no recorre `evento`.
  El "1 Issue" de Next en identidad del sitio era de las capturas: `page.screenshot` oculta el
  cursor con un style en los campos y, antes de hidratar, React lo reporta. `captura()` usa
  `caret: "initial"`; la app no tenía el error.
- A1: `src/nucleo/barrido.ts` (`barrer`, `iniciarBarrido` desde `instrumentation.ts`). Bandas
  con algo para retomar por `bandas_con_pendientes()` (SECURITY DEFINER, solo ids). Eventos:
  se toman en la base (`evento.tomadoEn`) antes de entregarse; uno tomado por otro proceso no
  se toca ni se adelanta el siguiente; colgado (>10 min) se retoma. Correos: PENDIENTE sale,
  FALLIDO se reintenta solo con `reintentarEn` (2 y 15 min), ENVIANDO colgado (>15 min) queda
  FALLIDO sin reintento automático. Pruebas: `tests/barrido.test.ts`.
- A2: `revisarDominios()` en `src/nucleo/dominios` (solo registro A; dos fallas seguidas →
  `noApuntaDesde`). Aviso en `MarcoPanel` (titular) y en la lista de dominios
  (insignia "No apunta a Deoco" + registro A a corregir). Componente propio `Aviso` en `@/ui`.
- A3: `DEOCO_CLAVE_SECRETOS_ANTERIOR` (se lee con las dos) + `scripts/rotar-clave-secretos.mjs`
  (todo o nada, repetible). Procedimiento en `docs/despliegue.md`.
- B: contrato `consultas`, `consultar()` en `src/nucleo/consultas` (vacío si el módulo está
  apagado, no existe, falla o tarda >3 s; quien pregunta valida con `interpretar`). Guía §6 ter.
- C: núcleo genérico de **cuentas externas** (`cuenta_externa`, `conCuentaExterna`,
  `app_referencia_externa`, `rutasExternas` en `/portal/<id>`; el selector manda al portal a
  quien no tiene bandas). Tienda: `tienda_orden` por (pedido, proveedor), creada con la deuda;
  pedido `DESPACHADO` cuando salen todas sus órdenes; evento `orden.despachada` → mail al fan
  con el seguimiento. Portal: órdenes (filtro), detalle (sin montos; link de impresión nuevo en
  cada apertura, 3 días), despachar, cuenta corriente y "marcar saldadas" (solo el proveedor).
  Back office: Proveedores → Accesos al panel. Pruebas: `tests/tienda-proveedor.test.ts`,
  `tests/e2e/tienda-proveedor.e2e.ts`.
- D: cobros al núcleo (`src/nucleo/pagos`, Credenciales → Cobros; la tienda lo usa igual) y
  adjuntos en el correo del núcleo (QR con `cid:`). Módulo `modulos/ticketera`:
  - Panel "Entradas": shows (nombre, fecha y hora, lugar, ciudad, dirección, descripción,
    foto), tipos (precio, cupo, ventana de venta), vendidas / pagando ahora / disponibles,
    borrador o publicado, compras y pagos a revisar.
  - Sitio: pestaña "Fechas" (`/fechas`, `/fechas/<id>` con la compra, `/fechas/compra/<id>?t=`
    con los QR). Cupo en la base (`ocupadas` con CHECK ≤ cupo, fila bloqueada); reserva de 20
    min que vence sola; entradas nominadas (nombre y documento) creadas al pagarse.
  - Mail con un QR por entrada (`compra.pagada`). Pago tardío: entra si hay lugar; si no, a
    revisión (la banda devuelve). Pagos duplicados quedan anotados.
  - Puerta (`/puerta`, rol PUERTA): escanear (cámara + jsQR) o tipear; resultado grande;
    "ya entró a las HH:MM"; reintentos con el mismo intento ante mala señal; resumen vivo.
  - El sitio muestra las fechas de la ticketera por la consulta `ticketera.proximas-fechas`;
    apagada, las cargadas a mano.
  - Pruebas: `tests/ticketera.test.ts`, `tests/e2e/ticketera.e2e.ts`.
- F: la vista previa del sitio arma lo mismo que el público: fechas por la misma consulta,
  pestañas de todos los módulos prendidos (las de otros módulos llevan al sitio de verdad) y
  la cabecera. Núcleo: `elementosDelMarco()` (`src/nucleo/publico/marco.tsx`), que también usa
  la superficie pública: una sola fuente para las dos.
- G1, apertura de venta:
  - Pool de 40 conexiones (`DEOCO_DB_CONEXIONES`), esperar conexión 10 s, transacción 15 s
    (`src/nucleo/db/config.ts`; el back office, 5).
  - Transacciones por página pública: de 6-10 a 3-6. Una lectura por pedido de módulos prendidos
    y nombre de la banda (`bandaBasica`), credenciales de cobro, show y producto (`cache`), y el
    proxy resuelve el host en una consulta (`resolver_banda_por_host`).
  - Ningún error técnico al fan: `src/nucleo/publico/errores.ts` ("agotada" o "hay mucha gente
    comprando, probá de nuevo"), `src/app/error.tsx` para lo que se escape.
  - Carga: `tests/carga/compras.test.ts` (400 compras a la vez por 25 lugares; 300 de 1 a 4 por 40;
    base saturada) y `npm run test:carga` (HTTP contra el build de producción: 300 fans cargan el
    show y compran a la vez por 30 lugares).
- G1, token: fuera de la URL de vuelta de la pasarela. Al comprar, cookie httpOnly en el sitio de
  la banda; en el mail, link con el token después de "#" (nunca llega a un servidor), que la página
  canjea por la cookie (`src/nucleo/publico/acceso.ts`, `canjear-link.tsx`). Sin acceso, solo el
  estado. El pedido de la tienda también tiene token ahora.
- G2, el proveedor: `conCuentaExternaEnBanda()` (núcleo, genérico): transacción en una banda que
  NO fija `app.tenant_id` sino `app.externo_tenant`. Solo alcanza lo que una política nombra:
  - Núcleo: emitir eventos y auditar a su nombre, leer los archivos que el módulo permita.
  - El módulo decide con `<id>_externo_banda(uuid)` y `<id>_externo_archivo(uuid)` (hook
    genérico `app_externo_permite`, sin nombrar módulos).
  - Tienda: UPDATE solo de sus órdenes y deudas, y disparadores que dejan cambiar solo las
    columnas de despachar y de saldar. El pedido pasa a DESPACHADO por un disparador de la base.
  - Contacto de la banda copiado en la orden al pagarse (el proveedor no lee miembros).
  - Pruebas: catálogo de políticas de escritura y recorrido de todas las tablas desde la
    transacción del proveedor (`tests/tienda-proveedor.test.ts`).
- G2, `tenant`: la política de lectura del staff pasa a una migración del núcleo
  (`20261029090000_nucleo_staff_lee_tenant`). Prueba: una migración que cambia tablas de un
  módulo no cambia tablas del núcleo ni de otro módulo (`tests/aislamiento.test.ts`).
- G2b, `usuario` con RLS (migración `20261030100000_usuario_rls`):
  - La persona lee y edita su fila en `conUsuario(id)` (`app.usuario_id`, solo núcleo). Una vez
    por pedido: `usuarioPropio()` (rol, staff, clave temporal, pantalla `/clave`).
  - deoco_app: sin INSERT ni DELETE; UPDATE solo de `nombre`, `hashContrasena`, `claveTemporal`.
    `esStaff` y `email` no se escriben desde la app ni forzando la consulta. La marca de clave
    temporal se saca solo cambiando la clave (disparador).
  - Login: `usuario_para_ingresar(email)` → id + hash. Staff (conStaff/leerComoStaff):
    `usuario_por_email_staff`, `crear_usuario_temporal` (nunca staff), `cuentas_externas_de`.
  - Un módulo no lee `usuario`: el contacto de la tienda usa `titularDeBanda(tx)`
    (`@/nucleo/personas`, solo su banda). Prueba estática en `tests/modulos.test.ts`.
  - Back office: sin cambios (deoco_admin, BYPASSRLS). Pruebas: `tests/usuario.test.ts`; la del
    recorrido de tablas del proveedor ya no tiene excepciones.
- G2b, la prueba del sitio que fallaba de a ratos: no era el sitio. `next dev` compila cada ruta la
  primera vez que se pide, y acá eso llegó a tardar más de 30 s (el límite de Playwright para
  navegar). El archivo del sitio corre primero, así que pagaba esas compilaciones: en la corrida
  que falló, `goto /ingresar` y `goto banda-a.lvh.me/` vencieron y otras 4 pruebas cayeron en
  cascada porque usan lo que carga la primera. Ahora `tests/e2e/servidor.ts` compila todas las
  rutas antes de la primera prueba (`precalentar`, ~40 s en frío), sin apuro; ninguna prueba
  mide compilación. Probado borrando la caché de Turbopack: 75/75.

- G3, registro del pago: `registrarCobro()` (`src/nucleo/pagos/registro.ts`) es la única regla
  (referencia de la banda, no aprobado, monto/moneda → EN_REVISION, duplicado, pagado una vez con
  cambio condicional, evento con clave única). Tienda y ticketera dan su `CosaACobrar`.
  - Ya habían divergido: la tienda guardaba el duplicado en una tabla; la ticketera, como texto en
    `observacion`. Ahora los dos, en `cobro_duplicado` (núcleo, RLS). Migraciones: la tabla de la
    tienda se copia y se borra; el texto de la ticketera se lee con una expresión y sale de la
    observación. El núcleo da `deoco_importar_cobro_duplicado()` (solo migraciones) para no
    escribir su tabla desde SQL de un módulo.
  - Unificado también: un aviso repetido de algo EN_REVISION da "en-revision" (la tienda decía
    "ya-pagado"); un duplicado repetido da "duplicado" (la ticketera decía "ya-pagada").
  - Pruebas: las de los dos módulos siguen igual (salvo leer el duplicado de la tabla nueva) y
    `tests/pagos-registro.test.ts` prueba la regla con un módulo falso.
- G3, responder-a: el mail de entradas no lo tenía. Ahora `enviarCorreo` usa el titular de la
  banda si el módulo no dice otro: ningún mail de banda le responde a Deoco. Revisados los demás
  (tienda: los tres ya lo tenían).
- G3, duplicados al núcleo: `@/nucleo/dinero`, `@/nucleo/fechas`, `@/nucleo/publico/estilo`,
  `@/nucleo/publico/refrescar`, `@/nucleo/publico/origen` (`origenDeBanda`, `origenDelPedido`;
  la URL estaba armada 4 veces, una con el puerto 3000 fijo, y el origen del pedido 3) y
  `esEmail` (6 copias; dos no limitaban el largo que el correo sí exige, una era más permisiva).

- G3b, `conEdicion` (3 copias) → `accionesDelPanel(() => modulo, [errores])`
  (`src/nucleo/acceso/acciones.ts`) con `edicion: { permiso, ruta, sinPermiso, guardado? }` en el
  contrato: el registro valida al arrancar que el permiso sea del módulo y la ruta una de sus
  pantallas. Además, `tests/modulos.test.ts` revisa que todo `"<id>.recurso.accion"` escrito
  en el código de un módulo esté declarado (probado con uno mal escrito: falla).
  - El contrato se pasa como `() => modulo`: la primera versión lo leía al cargar el archivo de
    acciones y en `next dev` daba `Cannot access default export before initialization`
    (importación circular index → pantallas → acciones → index). Las pruebas unitarias no lo
    vieron (no cargan esos archivos); el e2e sí, pero cada prueba esperaba 30 s. Ahora el
    precalentado del e2e corta en segundos si alguna ruta responde 500, con el motivo.
- G4: anotaciones en `docs/decisiones-pendientes.md` (bloque 4). Barrido: no retoma ni revisa
  dominios de bandas ARCHIVADAS (migración `20261101100000_barrido_sin_archivadas`; las
  SUSPENDIDAS sí). El barrido deja una línea en el log al arrancar y en cada vuelta que hace
  algo. Lista para el día del despliegue: `docs/verificacion-despliegue.md`.

- G5, cabecera pública: el contrato pasa a `cabeceraPublica: { componente, orden }` y el registro
  junta todas (`cabecerasPublicas`, por `orden` y por id si empatan) en vez de rechazar una
  segunda. `elementosDelMarco` pone en fila las de los módulos prendidos (cada una en
  `<span data-cabecera-modulo>`); los marcos siguen recibiendo un solo `cabecera`. La tienda
  queda con orden 10. Pruebas en `tests/modulos.test.ts` (orden, desempate, solo prendidos).

## Paso 4 · Módulo de tienda

Decisiones: pasarela detrás de una interfaz (`modulos/tienda/pasarelas/`), Mercado Pago
Checkout Pro con las credenciales de la banda; la fuente de verdad del pago es la consulta a la
API de la pasarela, no el aviso. Correo del núcleo por SMTP (Resend). Deuda con el proveedor:
se registra por orden, no se cobra. Envío fijo por producto base (campo preparado para zonas).
Proveedor por producto base, con uno por defecto. Foto propia o la del producto base.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Correo del núcleo, `conStaff()`, `rutasAdmin`, `urlFirmada()` | ✅ hecha |
| 2 | Catálogo base y proveedores, desde el back office | ✅ hecha |
| 3 | Panel de la banda: diseños, productos, precios y margen | ✅ hecha |
| 4 | Tienda pública: catálogo, carrito, checkout | ✅ hecha |
| 5 | Pago con Mercado Pago, aviso y deuda con el proveedor | ✅ hecha |
| 6 | Envío por proveedor, pago duplicado y mails (fan y proveedor) | ✅ hecha (a revisar) |

- Correo: tabla `correo` (RLS), estados PENDIENTE → ENVIANDO → ENVIADO/FALLIDO, `claveUnica`.
  Sin transporte en producción quedan pendientes (aviso en el log de arranque). Por ahora solo
  correos de banda (los de plataforma, cuando haga falta).
- Parte 2: tablas globales `tienda_proveedor` y `tienda_producto_base`; de banda (ya creadas
  para las reglas de costos) `tienda_producto`, `tienda_pedido`, `tienda_pedido_item`.
  - Dinero en centavos (Int), solo pesos. Variantes como opciones del producto base
    (`Talle: S, M, L`); el renglón guarda la selección.
  - Proveedor efectivo: el asignado o el de la plataforma. El primero cargado es el por
    defecto; el por defecto no se desactiva, y uno con productos base asignados tampoco.
    Los formatos del producto tienen que estar entre los que acepta su proveedor.
  - "En uso" lo garantiza la base: las tablas de banda referencian el producto base con
    clave foránea RESTRICT (Postgres la verifica aunque el staff no vea esas filas).
  - Copia de costos al pagarse: `fijarCostosDelPedido(tx, pedidoId)` (la usa la parte 5).
  - Núcleo: archivos de plataforma (`archivo_plataforma`, global) para las fotos del catálogo,
    servidos en cualquier host en `/archivos/plataforma/<id>/<nombre>`.
  - Ojo para la parte 4: una clave foránea no mira RLS; al crear un renglón hay que verificar
    bajo `conTenant` que el producto sea de la banda.
- Parte 3 (`/b/<slug>/tienda`): diseños, productos, margen.
  - Diseño: PNG (píxeles y dpi declarados, `sharp`) o PDF (tamaño de página, `pdf-lib`).
    Al subir se puede revisar contra un producto base ("Revisarlo para"); si no cumple no se
    guarda y el error trae los números. Cada diseño muestra para qué productos sirve; al crear
    o editar un producto se vuelve a validar. Más grande está bien, más chico no; un PNG sin
    dpi declarado se rechaza. Archivo privado de la banda, con vista previa en el panel.
  - Producto: base activo (solo para nuevos), diseño que sirva, nombre, descripción, precio
    (envío incluido), variantes ofrecidas (subconjunto del base), foto propia o la del base.
    Publicado/borrador es un estado del producto: lo que se edita en uno publicado se ve al
    guardar (no hay copia publicada aparte, a diferencia del sitio).
  - Margen = precio − producción − envío (costos vigentes del base), en pesos y % del precio.
    Negativo: aviso fuerte, se guarda igual. La pantalla aclara que Deoco no se lleva nada y
    que el margen no descuenta la comisión de la pasarela.
  - Permisos: `tienda.producto.ver` (todos los roles) y `tienda.producto.editar` (TITULAR,
    EDITOR, COMERCIAL), exigido también en el servidor.
- Parte 4 (sitio público, `/tienda`):
  - Catálogo y ficha (variantes, cantidad; sin variante elegida no agrega). Pestaña "Tienda"
    (orden 30) y el carrito como `cabeceraPublica` (sale el ejemplo del módulo de prueba).
  - Carrito en el `localStorage` del sitio de la banda; guarda qué y cuánto. Cada vez que
    cambia, y al confirmar, el servidor revisa todo (precio, publicado, variante) y avisa si
    un precio cambió. Una respuesta vieja de revisión no se muestra.
  - Checkout: datos del fan, dirección (24 provincias, CP de 4 dígitos o CPA), resumen. El
    pedido nace PENDIENTE con su copia de precio y envío por renglón y sus totales.
  - Total = suma de precios + un envío POR PROVEEDOR, el mayor de sus renglones (parte 6).
  - Aislamiento: además de buscar el producto bajo RLS, claves foráneas compuestas
    (tenantId, productoId) / (tenantId, pedidoId) / (tenantId, disenoId): la base rechaza
    mezclar bandas aunque se salteen las validaciones (incluso con el rol dueño).
  - Sin credenciales: el fan ve "la tienda no está recibiendo pedidos" (no puede agregar ni
    confirmar) y la banda ve un aviso en su panel con el link a Credenciales (titular).
  - Pasarelas: `modulos/tienda/pasarelas/` (interfaz + Mercado Pago, por ahora solo las
    credenciales; el cobro en la parte 5).
- Parte 5 (pago y deuda):
  - Envío: lo paga el fan aparte. Margen = precio − producción.
  - Pasarela (`modulos/tienda/pasarelas/`): `crearCobro`, `leerAviso`, `consultarCobro`,
    `probarConexion`. Mercado Pago: Checkout Pro con el token de la banda; `notification_url`
    = `urlAviso(…, "/pago/mercadopago")`, `external_reference` = id del pedido; vuelta a
    `/tienda/pedido/<id>?resultado=exito|fallo|pendiente`. En pruebas, `DEOCO_MERCADOPAGO_API`
    apunta a un Mercado Pago falso (`tests/mercadopago-falso.ts`).
  - Aviso: del cuerpo solo se toma el id; el cobro se consulta a la API con el token de la
    banda. Firma `x-signature` verificada si el titular cargó la clave de webhooks (opcional).
  - PENDIENTE → PAGADO condicional, solo si: aprobado, pedido de esa banda (RLS), monto y
    moneda (ARS) iguales. En la misma transacción: copia de costos, deuda y
    `emitir("pedido.pagado", …, { unica: "<pasarela>:<cobro>" })`.
  - Estados: PENDIENTE (con lo último que dijo la pasarela: pendiente, rechazado), PAGADO,
    EN_REVISION (aprobado pero no coincide: la banda lo ve marcado), CANCELADO (reservado).
    El fan ve en qué anda su pedido, puede reintentar el pago y la página se actualiza sola
    mientras se acredita.
  - Deuda (`tienda_deuda`): por (pedido, proveedor), producción de sus renglones + un envío
    (el mayor de sus renglones). Panel: "Deuda con proveedores"; back office: por banda y
    proveedor (`conStaff`, lectura auditada; políticas `lectura_staff` en `tienda_deuda` y
    `tenant`). `saldarDeudas()` lista (quién, cuándo, nota), sin pantalla: conviene que la
    confirme el proveedor desde su panel.
  - "Probar conexión" (titular, `tienda.pasarela.conectar` exclusivo): a nombre de quién cobra.
- Parte 6:
  - Envío por proveedor: el pedido guarda el desglose (`envios`); con más de un proveedor el
    checkout y el cobro lo muestran por paquete ("Envío de Remera Gira"). Con uno, igual que antes.
  - Pago duplicado: otro pago aprobado para un pedido ya cerrado se guarda en
    `tienda_pago_extra` (monto, id, pasarela); el pedido no cambia y la banda lo ve marcado en
    Pedidos con cómo devolverlo desde su pasarela (`Pasarela.comoDevolver`).
  - Mails (`pedido.pagado` → `alPagarsePedido`): al fan (qué compró, variantes, envíos, total,
    dirección, qué sigue; a nombre de la banda, responder-a al contacto) y una orden por
    proveedor (sus renglones, variante, cantidad, link firmado al archivo de impresión por 14
    días, dirección y teléfono del fan, contacto de la banda; sin montos ni datos de pago ni el
    mail del fan). Claves únicas `pedido:<id>:fan` y `pedido:<id>:orden:<proveedor>`.
  - Contacto de la tienda (`tienda_config`): lo carga la banda en el panel; si no, el mail del
    titular.
- `conStaff`: la auditoría se inserta sin RETURNING (la política deja insertar, no leer).
- Pendiente anotado: barrido de correos y eventos pendientes al arrancar (hoy salen con el
  siguiente de la misma banda o al reintentar).

## Dominios y preparación para la tienda

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Cierre de dominios: HTTPS antes de principal, quitar con confirmación | ✅ hecha |
| 2a | Parámetros de URL para las rutas de módulos | ✅ hecha |
| 2b | Secretos por banda | ✅ hecha |
| 2c | Avisos externos en `app.<raiz>` + `emitir({ unica })` | ✅ hecha |
| 2d | Título y vista previa por página (y el sitio: nombre de la banda) | ✅ hecha |
| 2e | Elemento del módulo en la cabecera del marco (carrito) + pestaña activa por segmento | ✅ hecha |

Con esto el contrato queda listo para la tienda.

- Principal: antes de marcarlo, `https://<dominio>/` tiene que responder con certificado válido
  (sin seguir redirecciones; cualquier estado HTTP sirve). Si no, explica que falta el certificado.
- Quitar: confirmado; el principal no (primero otro principal); el subdominio, nunca.
- Parámetros: `consulta: URLSearchParams` en `PropsRutaPanel` y `PropsRutaPublica`.
- Avisos: el núcleo resuelve banda y módulo; la firma, el módulo (cuerpo crudo). Una banda
  suspendida o morosa sigue recibiendo avisos (los pagos de sus ventas tienen que entrar).
  Idempotencia: `emitir(..., { unica })`, índice único (banda, nombre, clave).
- Metadatos: el sitio aporta nombre, bio corta e imagen (fondo o logo, solo PNG/JPG/WebP); el
  press kit, "Press kit", la bio larga resumida y la primera foto. 404 propio con el nombre de
  la banda en sus hosts.
- `/clave` también quedó reservada en el sitio (ya existía como ruta de la plataforma).
- Secretos: ver CLAUDE.md "Secretos por banda". Garantía de "solo el módulo dueño": el núcleo
  exige el objeto de contrato registrado, y una prueba impide que un módulo importe el de otro,
  el registro o la carga.

### Anotado, no ahora

- Reverificación periódica de dominios (si el DNS deja de apuntar, hoy sigue verificado).
- Correo: con la tienda. Consultas entre módulos: con la ticketera.
- Rotación de `DEOCO_CLAVE_SECRETOS` (el formato lleva versión; falta el proceso).

## Mientras despliego

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Verificación de dominio propio | ✅ hecha |
| 2 | Repaso de la navegación pública | ✅ hecho (faltantes del contrato, abajo) |

- Dominio propio: la banda (titular) lo agrega en `/b/<slug>/dominios` (o el staff en `/admin`)
  y ve dos registros exactos para copiar: `A <dominio> → IP del servidor` y
  `TXT _deoco.<dominio> → deoco-verificacion=<token>`. "Verificar" consulta el DNS.
  - Por qué dos registros: el A solo no prueba que el dominio sea de esa banda (cualquiera que
    apunte a Deoco sería "verificable" por quien lo cargó primero). El TXT lleva un token por
    banda. Sin verificar, el mismo dominio puede estar cargado en varias bandas; lo gana la que
    prueba que es suyo, y verificado es de una sola (índice único parcial).
  - IP: `DEOCO_IP_PUBLICA` si está; si no, la que resuelve `app.<raiz>`.
  - Sin verificar no resuelve (`resolver_tenant_por_host` filtra por `verificado`).
  - Principal: solo verificado (también lo exige la base). Los demás dominios de la banda,
    subdominio incluido, redirigen al principal con 307 (misma ruta y consulta).
  - El certificado no lo emite la app: el dominio se agrega en Easypanel (ver `docs/despliegue.md`).
- Navegación pública: con un módulo que solo declara ruta y pestaña, la pestaña entra sola en el
  marco del sitio, en su orden, sin tocar el módulo sitio (`tests/modulos.test.ts` con tienda y
  ticketera falsas intercaladas; `tests/e2e/sitio.e2e.ts` con el módulo de prueba).

## Despliegue

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Confirmación al quitar un miembro (mensaje propio si es uno mismo) | ✅ hecha |
| 2 | Repaso previo al despliegue | ✅ hecho |

- Verificación de arranque en producción (`src/nucleo/arranque.ts`): variables, roles (app sin
  BYPASSRLS ni dueña de tablas; admin con BYPASSRLS; no cruzados), volumen, módulos, base migrada,
  build de producción. Falla → el proceso termina con la lista de problemas.
- `scripts/crear-staff.mjs`: primer staff en un paso desde la consola de la app.
- Ensayo completo sobre Postgres vacío, detrás de un proxy HTTPS (ver `docs/despliegue.md`).
- No verificado: build de la imagen Docker y certificado comodín en Easypanel (primer despliegue).

## Paso 3 · Formularios y back office

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Formularios que conservan lo escrito ante un error (`@/ui` + guía) | ✅ hecha, en revisión |
| 2a | Back office: conexión admin, auditoría, listado de bandas, alta | ✅ aprobada |
| 2b | Clave temporal con cambio obligatorio + cambio de clave normal | ✅ hecha, en revisión |
| 2c | Back office: estados, módulos, dominios, usuarios, eventos fallidos | ✅ hecha, en revisión |

Pruebas del back office: 1 (404), 2 (alta → titular entra), 3 (dependencia, mismo mensaje),
4 (conexión admin solo en /admin), 5 (auditoría), 6 (archivar/reactivar), 7 (clave temporal),
8 (último titular), 9 (reprocesar) — `tests/admin.test.ts`, `tests/backoffice.test.ts`,
`tests/e2e/admin.e2e.ts`.

- 2b: la clave temporal no se guarda en ningún lado (ni en la auditoría).
- **Pendiente:** cambiar la clave no cierra las otras sesiones abiertas (la sesión es un JWT
  sin estado en el servidor). Llega cuando haya sesiones en servidor.
- 2c: dominios propios se registran sin verificar y no pueden ser subdominios de la raíz;
  quitar/degradar titular bloquea la fila de la banda (dos cambios a la vez no la dejan sin titular).

- 2a: rol `deoco_admin` (BYPASSRLS, no dueño, sin acceso a `_prisma_migrations`), cliente solo
  en `src/app/admin/_servidor`; tabla `auditoria` con RLS (la app ve solo la de su banda);
  alta con titular existente o nuevo (clave temporal mostrada una vez, nunca guardada en claro);
  subdominios reservados: app, www, admin, api, mail, static, assets, deoco.
- 1: `Formulario` despacha la acción desde `onSubmit` (con `action` de respaldo antes de
  hidratar); `limpiarAlGuardar` solo en formularios de "agregar". Encontrado de paso: los
  `<textarea>` llegaban con `\r\n` y se guardaban así; `@/ui/servidor` normaliza.

## Paso 2 · Cierre · Untitled UI oficial y despliegue

| # | Parte | Estado |
| --- | --- | --- |
| 1 | `@/ui` sobre los componentes oficiales de Untitled UI | ✅ hecha, en revisión |
| 2 | Despliegue en Easypanel (`Dockerfile`, `scripts/arrancar.sh`, `docs/despliegue.md`) | ✅ hecha, en revisión |

- Oficiales: Button, Input, TextArea, NativeSelect, Badge, Checkbox. Propios: `CampoArchivo`
  (FileTrigger/InputFile no ponen `name` y el archivo no viaja en el FormData) y `Tarjeta`
  (no hay oficial gratuito).
- Encontrado al simular el contenedor: `next build` exigía `DATABASE_URL` (cliente Prisma
  creado al importar → ahora perezoso) y `prisma generate` exigía `DATABASE_URL_MIGRACIONES`.
- No verificado: build de la imagen Docker (imagen base bloqueada desde el entorno) y login en
  producción (necesita HTTPS). Se ven en el primer despliegue.

Pendientes anotados:
- ~~Formularios que se vacían ante un error~~ → resuelto en Paso 3.
- Back office: alta de bandas, usuarios y dominios propios (hoy por SQL).
- Consultas entre módulos (llega con la ticketera).

## Paso 2 · Módulo de sitio

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Tablas de módulos (infraestructura) + guía | ✅ hecha |
| 2 | Esquema de `modulos/sitio` + migración con RLS | ✅ aprobada |
| 3 | Almacenamiento de archivos (disco + `Almacen`, cuota, sharp, SVG como descarga) | ✅ hecha, en revisión |
| 4 | `marcoPublico` en el contrato | ✅ hecha, en revisión |
| 5 | Borrador y publicado (`sitio_publicacion`) | ✅ hecha, en revisión |
| 6 | Pantallas del panel (tema Untitled UI + kit `src/ui`) | ✅ hecha, en revisión — componentes oficiales pendientes (red) |
| 7 | Sitio público: home y press kit | ✅ hecha, en revisión |

### Pruebas del módulo sitio

- [x] 1. La banda carga home y press kit desde el panel y se ven en su sitio — e2e
- [x] 2. El sitio público responde sin sesión y no filtra nada del panel — e2e
- [x] 3. Dos bandas con contenido distinto: cada sitio muestra lo suyo — e2e
- [x] 4. Un rol sin `sitio.contenido.editar` ve el panel pero no puede guardar (UI y servidor) — e2e
- [x] 5. Las tablas del módulo tienen RLS — `tests/aislamiento.test.ts`
- [x] 6. Un archivo de la banda A no es accesible desde el sitio de la B — `tests/archivos.test.ts` + e2e
- [x] 7. Lo guardado en borrador no aparece en el sitio hasta que se publica — e2e
- [x] 8. Un SVG descargable se sirve como descarga, no se renderiza — `tests/archivos.test.ts` + e2e
- [x] 9. Pasada la cuota, la subida se rechaza con un mensaje claro — `tests/archivos.test.ts` + e2e

E2E en `tests/e2e/sitio.e2e.ts`.

Decisiones:
- Borrador = las tablas `sitio_*`; publicado = foto JSON en `sitio_publicacion`. Un solo
  renderizador para el sitio público y la vista previa. Al publicar, los archivos usados quedan
  públicos y los que ya no usa nadie se borran. Comparación borrador/publicado con claves
  ordenadas (jsonb no conserva el orden).
- Versiones web (WebP): slider 1600 px, fondo 2000 px, logo 600 px, miniaturas del press kit 800 px.
  Los descargables conservan el original.
- Tipografías del sitio (Inter, Fraunces, Space Mono) desde paquetes @fontsource: sin terceros.
- Untitled UI: `untitledui init` instaló el tema oficial; `untitledui add` no puede bajar
  componentes (untitledui.com y github.com bloqueados por la red del entorno, 403). Pantallas
  con un kit propio sobre el tema, en `src/ui/`, para reemplazar por los oficiales.
- La superficie pública del núcleo pasó de `"sitio"` a `"publico"`: chocaba con el id del
  módulo `sitio` (lo detectó la prueba de la regla de oro).
- Archivos en el esquema del sitio: solo ids (`...ArchivoId`), independientes del almacenamiento.

Pendiente:
- Habilitar untitledui.com en la red del entorno y reemplazar `src/ui` por los componentes oficiales.

## Paso 2 · Parte 0 · Cierres antes del módulo de sitio

| # | Cierre | Estado |
| --- | --- | --- |
| 1 | Tablas de módulos (esquema por módulo, prefijo, RLS) | ✅ aprobada y aplicada |
| 2 | `emitir(..., { tx })`: evento atómico con la operación | ✅ aprobada |
| 3 | Módulo de prueba fuera del build con `next build` directo | ✅ aprobada |

- 2: `conTenant` registra tareas `alConfirmar(tx, fn)` que corren solo tras el commit; el bus
  programa la entrega ahí. Prueba: una operación que falla después de emitir no deja ni el
  dato ni la fila del evento (`tests/eventos.test.ts`).
- 3: `next.config.ts` corre el descubrimiento según la fase (`next build` → producción).
  Verificado con `next build` directo: sin rastros de `modulos/prueba` en `.next`.

---

# Paso 1 · Núcleo

Fuente: `docs/spec/00-especificacion-nucleo.md`. Una parte por vez; cada una se
revisa y aprueba antes de pasar a la siguiente.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Esquema Prisma + migraciones con RLS + `conTenant()` | ✅ aprobada |
| 2a | Estados del tenant + proxy de resolución por dominio | ✅ aprobada |
| 2a′ | Corrección: panel en `app.<raiz>/b/<slug>`, proxy con dos caminos | ✅ aprobada |
| 2c | Auth.js + membresía y rol por pedido + `puede()` + staff + solo titular | ✅ aprobada |
| 3 | Registro de módulos (contrato, descubrimiento, encendido, navegación, módulo de prueba) | ✅ aprobada |
| 4 | Ajustes de módulos + bus de eventos | ✅ hecha, en revisión |

## Pruebas de aceptación del paso

- [x] 1. Dos tenants: una consulta con el tenant A jamás devuelve filas del B — `tests/aislamiento.test.ts`
- [x] 2. Una consulta SIN filtro de tenant no filtra datos (RLS) — `tests/aislamiento.test.ts`
- [ ] 3. Usuario en dos bandas con rol distinto; `puede()` lo refleja
- [x] 4. Módulo de prueba aparece en la navegación; apagado devuelve 404 — parte 3
- [x] 5. Evento emitido queda en la tabla y dispara a su suscripto — parte 4

### Pruebas de la parte 2

- [x] 1. Host de la banda A → tenant A; host inexistente → 404 — `tests/proxy.test.ts`
- [x] 2. Usuario sin membresía en esa banda (`/b/<slug>`) → 403 — `tests/e2e/panel.e2e.ts`, `tests/permisos.test.ts`
- [x] 3. Mismo usuario, dos bandas, dos roles: `puede()` distinto en cada una — `tests/permisos.test.ts`
- [x] 4. Cambiar de `/b/banda-a` a `/b/banda-b` no pide re-login y cambia rol — `tests/e2e/panel.e2e.ts`
- [x] 5. `SUSPENDIDO`: panel 403, sitio 200. `ARCHIVADO`: ambos 404, por host y por slug — `tests/proxy.test.ts`
- [x] 6. Staff entra a cualquier banda pero no pasa el permiso de pasarela — ambos archivos
- [x] 7. Banda `SUSPENDIDO`: titular entra a `/pago`; `EDITOR` (y staff) 403 — `tests/e2e/panel.e2e.ts`
- [x] 8. La cookie de sesión no se manda a `banda-a.lvh.me` — `tests/e2e/panel.e2e.ts`

### Pruebas de la parte 3

- [x] 1. El módulo de prueba se registra, aparece en navegación y sus rutas responden
- [x] 2. Apagado: rutas 404, sin entrada de menú, `puede()` false en sus permisos
- [x] 3. Prendido para A y apagado para B: cada una ve lo suyo
- [x] 4. Prender sin la dependencia falla con un error claro
- [x] 5. Sin el permiso no se ve la entrada de menú aunque el módulo esté prendido

En `tests/modulos.test.ts` (unitarias) y `tests/e2e/modulos.e2e.ts` (navegador).

### Pruebas de la parte 4

- [x] 1. Emitir guarda la fila en `evento` con tenant, nombre, fecha y payload
- [x] 2. El suscripto recibe el evento y corre
- [x] 3. Un suscripto que falla no impide que corra el otro; el fallo queda anotado
- [x] 4. Módulo apagado en A no recibe los de A, sí los de B donde está prendido
- [x] 5. Reprocesar un evento fallido lo vuelve a entregar
- [x] 6. Un nombre mal formado se rechaza

En `tests/eventos.test.ts`. Además: orden de emisión, emitir no espera al suscripto, y
en `tests/e2e/modulos.e2e.ts` un pedido real responde en ~300 ms con un suscripto de 1,5 s.

## Decisiones tomadas en la parte 4

- Apagar un módulo que otro prendido usa falla y nombra quién lo usa. Prender/apagar exige staff.
- `SOLO_DESARROLLO.md` en la carpeta del módulo lo excluye del build de producción.
- No bloquear: `emitir` inserta la fila (una sola escritura, para no perder el evento) y la
  entrega va en `after()`, que Next corre después de mandar la respuesta. Fuera de un
  pedido, la entrega queda en segundo plano sin esperarla.
- Orden: una cola en memoria por banda; cada vuelta toma el PENDIENTE de menor `secuencia`.
  Un evento FALLIDO no frena los siguientes.
- Reproceso: vuelve a PENDIENTE y se entrega solo a los suscriptos que fallaron en el
  último intento. El historial de fallos se conserva.
- Solo se puede emitir lo que algún módulo declara en `eventosEmite`.
- Pasado: se valida por la terminación del participio (-ado/-ido y las irregulares -to/-cho/-so).
- `PropsRutaPanel` suma `slug` (los módulos lo necesitan para armar links).
- `modulos/prueba` emite y escucha `prueba.verificada`, como ejemplo.

## Decisiones tomadas en la parte 3

- Descubrimiento por generación de código (`src/generated/modulos.ts`): Next empaqueta y no
  puede leer `modulos/` en tiempo de ejecución. El núcleo importa la lista, nunca un módulo.
- Contrato: `navegacion[].orden` (número, obligatorio); `RutaModulo = { ruta, permiso?, componente }`
  con segmentos `[param]`; `componente` recibe `{ tenantId, acceso, params }` (panel) o
  `{ tenantId, params }` (sitio).
- Rutas reservadas del núcleo; choques entre módulos y navegación a rutas inexistentes fallan al arrancar.
- Ruta de panel: primero membresía (403), después módulo prendido (404), después permiso (403).
- Las dependencias se validan solo al prender. Una dependencia que no existe en el código no
  rompe el arranque; prender el módulo falla.
- `apagarModulo()` no chequea si otro módulo prendido depende del que se apaga (ver preguntas).
- La home pública (`/`) la aportará un módulo; mientras tanto se ve el nombre de la banda.

## Decisiones tomadas en la parte 2c

- Permiso con `exclusivoTitular: true` (agregado opcional al contrato de permisos): marca
  la pasarela de cobro sin que el núcleo conozca módulos. Solo admite `rolesPorDefecto: ["TITULAR"]`.
- Staff que además es miembro de la banda: vale su rol (un staff titular sí tiene su pasarela).
- `/b/<slug>/pago` exige TITULAR siempre (el titular es quien paga), no solo con la marca del proxy.
- Selector: función `bandas_visibles(usuario)` (SECURITY DEFINER; el chequeo de staff lo hace
  la base). No lista bandas ARCHIVADAS. La conexión aparte del back office llega con el back office.
- `/` en `app.<raiz>` es el selector; en un host de banda es la home pública (provisoria, anónima).
- `puede()` todavía no mira si el módulo está prendido: entra con el registro de módulos (parte 4).

## Decisiones tomadas en la parte 2a / 2a′

- Panel en `app.<raiz>`: `/b/<slug>/...` es una banda; sin slug, selector de bandas.
  Los hosts de banda (subdominio o dominio propio) son solo sitio público, anónimo.
- Slug → tenant con `resolver_tenant_por_slug` (SECURITY DEFINER, devuelve solo el id).
- El tenant viaja en cabeceras `x-deoco-*`; el proxy borra las que vengan de afuera.
- `/b/<slug>/pago` lo define el núcleo; con tenant suspendido pasa marcada `soloTitular`
  (el chequeo del titular y de la membresía se hace en 2b, con la sesión).
- Pruebas en una base separada (`deoco_test`, `.env.test`).

## Decisiones tomadas en la parte 1

- La política usa `app_tenant_id()` = `NULLIF(current_setting('app.tenant_id', true), '')::uuid`.
  Sin variable fijada da NULL → cero filas (en vez de error). Equivale a la regla pedida.
- `tenant` tiene RLS por su propio `id`. `usuario` tiene RLS por persona desde G2b (antes no tenía).
- `dominio` tiene RLS; el middleware resuelve el host con la función
  `resolver_tenant_por_host(host)` (SECURITY DEFINER), que devuelve solo el id del tenant.
- `moduloTenant`: la existencia de la fila = módulo prendido.
- `evento.usuarioId` es opcional (eventos disparados por el sistema).
- Índice único: un solo dominio principal por banda.
- El rol `deoco_app` se crea fuera de las migraciones (`prisma/sql/crear-rol-app.sql`),
  porque crear roles requiere un administrador del servidor.

## Repaso final del paso 1

Las cinco pruebas originales pasan:

| # | Prueba | Dónde |
| --- | --- | --- |
| 1 | Dos tenants: el A jamás ve filas del B | `tests/aislamiento.test.ts` |
| 2 | Consulta sin filtro de tenant no filtra (RLS) | `tests/aislamiento.test.ts` |
| 3 | Usuario en dos bandas, rol distinto, `puede()` lo refleja | `tests/permisos.test.ts`, `tests/e2e/panel.e2e.ts` |
| 4 | Módulo de prueba en la navegación; apagado 404 | `tests/modulos.test.ts`, `tests/e2e/modulos.e2e.ts` |
| 5 | Evento emitido queda en la tabla y dispara al suscripto | `tests/eventos.test.ts`, `tests/e2e/modulos.e2e.ts` |

## Queda abierto (fuera del paso 1 o sin definir)

- ~~**Tablas de módulos**~~ → resuelto: `modulos/<id>/esquema.prisma` + migraciones con
  `deoco_aislar_tabla` (Paso 4).
- ~~**Back office**~~ → resuelto: rol `deoco_admin`, `/admin`, eventos fallidos, y el barrido (A1).
- ~~**Eventos pendientes tras un reinicio**~~ → resuelto con el barrido (trabajo largo, A1).
- ~~Emitir dentro de la transacción de quien emite~~ → resuelto en Paso 2 · Parte 0.
- ~~**Accesos del staff**~~ → resuelto: `registrarAccesoStaff()` escribe en `auditoria` (una fila
  cada 10 min) y la carga de credenciales de cobro deja su fila (`src/nucleo/secretos/carga.ts`).
- **Una sola instancia**: el bus y el orden por banda viven en memoria del proceso. Sigue abierto
  (ver `docs/decisiones-pendientes.md`); no hace falta hasta que la carga pida más de una.
- ~~**Dominio propio**: verificación DNS~~ → resuelto en "Mientras despliego" (el certificado lo emite Easypanel).
- **Limpieza de `correo` y `evento`**: propuesta en `docs/decisiones-pendientes.md` (bloque 4),
  a aplicar con los números del primer mes en producción.

## Preguntas abiertas

- (ninguna)
