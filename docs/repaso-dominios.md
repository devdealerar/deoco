# Repaso de dominios y correo (D9–D13): seguridad, carga y lo que solo se probó contra falsos

Hecho al cerrar D13, sobre todo lo nuevo de dominios, cobro de dominios y correo. Las mismas tres
preguntas de siempre. Lo que se arregló en el momento está marcado **(arreglado)** con la prueba
que lo cubre; lo demás queda abierto, con qué haría.

## 1. ¿Dónde se rompió la regla de oro?

**Cualquier módulo podía arrancar una compra sin cobro (arreglado).** `dominioPagado` y
`renovacionPagada` estaban exportados del núcleo sin control: un módulo cualquiera (la tienda, uno
futuro) podía importarlos y registrar un dominio en GoDaddy, con la plata de Deoco, sin que nadie
hubiera pagado. "Nunca se registra antes de cobrar" dependía de una convención. Ahora reciben el
módulo que llama y solo aceptan al gestor de cuenta que cobra los dominios, igual que la cuenta de
la cuota. Prueba: `tests/compra.test.ts`, "solo el gestor de cuenta…".

**El dinero de los dominios entra a Deoco.** No es una rotura: es una segunda excepción a "el
dinero de las ventas nunca pasa por Deoco", como la cuota, y por la misma razón (la banda le compra
algo a Deoco). Queda en tablas del gestor separadas de la cuota y de las ventas, con su propio
aviso. Lo que sí implica: **las devoluciones salen de la cuenta de Deoco**, y si no tiene saldo no
salen. Se reintentan y quedan en rojo arriba de todo el back office, pero la plata tiene que estar.

**El staff puede marcar una devolución "a mano" sin haberla hecho.** Queda auditado con su nota,
pero no hay control de que la plata haya salido. Es un riesgo de alguien de adentro, no de una
banda. Qué haría: que "a mano" pida el número de operación de Mercado Pago y que el barrido lo
verifique contra la API (`devuelto` en el pago).

**Aislamiento.** Todas las tablas nuevas tienen `tenantId` + RLS (`tests/aislamiento.test.ts`);
las de lectura entre bandas son solo para el staff (`app_es_staff()`). Las funciones del barrido
que cruzan bandas devuelven solo ids. El núcleo no nombra módulos (`tests/modulos.test.ts`).

**Datos personales del titular en el WHOIS (decidido y hecho).** Se registra con privacidad,
incluida en el precio y activada por defecto (`privacy: true`). En una terminación que no la
permite (la marca el staff), a la banda se le dice antes de pagar que los datos quedan públicos.
Sin confirmar con GoDaddy: que se active en el registro mismo y cuánto cuesta
(`verificacion-despliegue.md`, 20).

**El dominio queda desbloqueado para siempre si la transferencia nunca se hace.** Pedir el código
lo desbloquea y no se vuelve a bloquear. Con el código, alguien que lo tenga podría llevárselo.
Qué haría: volver a bloquearlo a los 30 días sin transferencia (hace falta `bloquear` en
`Registrador`, endpoint sin confirmar).

**El código de transferencia no viaja por mail ni se guarda** (se muestra en el panel al titular):
correcto. Los datos del titular sí se guardan sin vencimiento (`comercial_dominio_cobro.datos`,
`dominio_compra.contacto`), también los de cobros que nunca se pagaron. Qué haría: limpiar los
cobros sin pagar a los 30 días, en la limpieza diaria.

**El aviso de pago de dominios sin firma (arreglado).** Sin la clave de avisos se aceptaba sin
firma. No alcanzaba para falsificar un pago (siempre se consulta a la API), pero cualquiera podía
inundar el aviso con ids inventados y gastar el cupo de llamadas de la cuenta de Deoco. Para
vender dominios el arranque ahora exige `DEOCO_CUOTA_MP_SECRETO_AVISOS` (`tests/arranque.test.ts`).

## 2. ¿Qué falla primero con 500 bandas?

Medido en `tests/carga/dominios.test.ts` (200 bandas pagando a la vez, cada aviso repetido):

1. **La cola de GoDaddy.** Cada compra hace **7 pedidos** al registrador. Con el tope de 59 por
   minuto por cuenta, 200 compras juntas tardan **~24 minutos** solo en la cola: unas 8 compras por
   minuto. Nada se pierde ni se registra dos veces (lo verifica la prueba), pero en un lanzamiento
   con muchas compras el progreso va a decir "Estamos registrando" un buen rato. Si se escala a dos
   procesos, cada uno tiene su cola: hay que bajar `DEOCO_GODADDY_POR_MINUTO` a la mitad en cada
   uno o GoDaddy contesta 429 (se reintenta, pero se pierde tiempo).
2. **El barrido se frenaba detrás de esa cola (arreglado).** Corría en serie: con muchas compras
   una vuelta podía quedar minutos esperando a GoDaddy, y mientras tanto no se reintentaban mails
   ni eventos, ni corrían la cuota ni las devoluciones. Ahora las compras y los vencimientos corren
   aparte, con su propio candado. Medido: una vuelta con 200 compras pendientes y GoDaddy lento,
   **1,4 s**.
3. **El pool de conexiones ante avisos simultáneos.** 400 avisos de pago a la vez saturan el pool:
   la mitad contesta error y entra cuando Mercado Pago reintenta (la prueba lo modela). Antes, el
   mail "Recibimos tu pago" podía perderse en ese caso **(arreglado)**: ahora se encola en la misma
   transacción que la compra (200 compras → 200 mails, ni uno de más ni de menos).
4. **Cloudflare, sin cola propia.** Su API deja 1200 pedidos cada 5 minutos por token. La revisión
   de cada 6 h consulta un dominio por vez: con 500 bandas y unos 1000 dominios propios se acerca al
   límite. Un 429 no cuenta como problema de la banda (no hay avisos falsos), pero **se reintentaba
   en cada vuelta del barrido, cada minuto, alimentando la propia tormenta (arreglado)**: ahora a
   los 15 minutos (`tests/barrido.test.ts`). Pendiente: una cola para Cloudflare como la de GoDaddy,
   y repartir la revisión de 6 h en el tiempo en vez de hacerla toda junta.
5. **Las revisiones de correo, salidas y delegaciones siguen dentro del barrido** y hablan con
   Cloudflare y Resend sin cola. Con cientos de pendientes a la vez (raro) frenan la vuelta. Mismo
   arreglo que las compras si hiciera falta.

## 3. ¿Qué está probado solo contra falsos?

Todo lo de servicios externos. Los falsos imitan lo documentado y lo que se pudo leer; lo que no se
pudo confirmar está marcado en el código y en `docs/verificacion-despliegue.md` (puntos 14–19):

- **GoDaddy**: todo. Los endpoints marcados "SIN CONFIRMAR" en `godaddy.ts` (disponibilidad,
  condiciones, subcuenta, nombres de las acciones, desbloqueo y código, contactos, transferencia
  entrante), los códigos de error, los plazos (gracia, recuperación, 60 días: `plazos.ts`).
- **Mercado Pago, pagos únicos**: que `binary_mode` y las exclusiones se comporten como dice la
  documentación en la cuenta AR; la búsqueda por `external_reference`; la devolución con
  `X-Idempotency-Key` y qué contesta sin saldo; que los avisos de `notification_url` lleguen
  firmados.
- **Cloudflare**: custom hostnames y su validación por TXT/HTTP, zonas con `jump_start`, Email
  Routing, el Worker y el KV, el estado "moved" al irse los nameservers.
- **Resend**: dominios de envío y su verificación; el Worker reenviando (y qué pasa si falla o con
  más de 20 MB).
- **El ensayo con la imagen de producción** (D13) usó estos mismos falsos: prueba la app entera
  desplegada, no los servicios.
