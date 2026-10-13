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
