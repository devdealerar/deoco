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
