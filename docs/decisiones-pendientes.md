# Decisiones para revisar

Tomadas sin consultar durante el trabajo largo sin supervisión. Cada una dice qué se eligió
y por qué. Si alguna no va, se cambia.

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

