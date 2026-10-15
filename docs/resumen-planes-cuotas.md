# Trabajo largo · Planes, cuotas y autogestión: resumen

Rama `claudev/bold-mendel-t4qerk`, un commit por parte con las pruebas en verde. Las decisiones
que tomé sin preguntar, cada una con su porqué: `docs/decisiones-pendientes.md`, secciones
**P1–P4** (arriba de todo). **Revisalas antes que nada.**

## Qué quedó hecho

| Parte | Qué | Dónde |
| --- | --- | --- |
| P1 | **Planes y cuota.** Esencial, Medium, Premium y Pro, editables por el staff (módulos, espacio, topes, precio en pesos). Límites que hacen cumplir los módulos (productos y shows publicados) con un mensaje que nombra el plan que lo resuelve; bajar de plan despublica lo último publicado, sin borrar. Cuota mensual por suscripción de Mercado Pago **en la cuenta de Deoco** (credenciales del entorno), estados automáticos (MOROSO con mail, SUSPENDIDO a los 10 días, ACTIVO al pagar), prueba de 14 días de Medium sin tarjeta. Plan y pago para el titular; back office de cuentas, planes y plazos, Pro a medida y cuotas fallidas. | núcleo: `src/nucleo/cuenta`, `src/nucleo/pagos/cuota.ts`, avisos de plataforma, tareas periódicas · módulo `modulos/comercial` |
| P2 | **Alta sola** en `app.<raíz>/registro`: email verificado obligatorio (el usuario recién existe al abrir el link), banda con subdominio (reservados), prueba o plan (con plan va a la pasarela de Deoco), queda en su panel con el sitio en línea. Una banda por cuenta, freno por IP y por email, campo trampa. El staff ve las altas (filtro "Autogestión"). | `src/nucleo/autogestion`, `src/app/registro` |
| P3 | **Inicio del panel**: un bloque por módulo prendido (consulta `inicio`): tu cuenta (titular), sitio, tienda (pedidos y vendido del mes, sin despachar, deuda con proveedores), entradas (próximo show, vendidas, disponibles); "Para hacer" junta lo que falta. Ticketera apagada → sin bloque. | `src/nucleo/inicio`, `modulos/*/inicio.ts` |
| P4 | **Endurecimiento**: limpieza diaria de correos enviados (adjuntos 7 d, cuerpo 90 d, fila 1 año; nunca lo pendiente o fallido); roles PUERTA y COMERCIAL pasaron a los módulos (`roles` en el contrato, `membresia.rol` texto); carga de toda la plataforma: **techo ~65 pedidos/s por proceso**, sin errores en ningún escalón. | `src/nucleo/correo/limpieza.ts`, `src/nucleo/acceso/roles.ts`, `tests/carga/plataforma.carga.ts` |
| P5 | Todo en verde; **ensayo con la imagen de producción** sobre base vacía: alta sola → Premium → pasarela de Deoco → cuota cobrada → sitio, tienda y entradas vendiendo → mora → suspensión → pago → activa. Capturas y documentación. | `docs/despliegue.md` ("Qué se verificó"), `docs/capturas/20-…27-…` |

## Pruebas

- `npm test`: 35 archivos, 444 pruebas. Las 8 pedidas para P1 están en `tests/comercial.test.ts`
  (plan prende/apaga; mensaje de límite con el plan; bajar despublica al revés sin borrar; cobro
  fallido → MOROSO → 10 días → SUSPENDIDO; SUSPENDIDO = sitio online y panel bloqueado; el pago
  regulariza al instante; fin de prueba suspende sin borrar; cuota y ventas nunca se mezclan:
  cuenta, credenciales y tablas). P2: `tests/autogestion.test.ts`. P3: `tests/inicio.test.ts`.
  P4: `tests/correo-limpieza.test.ts`, `tests/roles.test.ts`.
- `npm run test:e2e`: 15 archivos, 86 pruebas (suman `comercial.e2e.ts` y `autogestion.e2e.ts`).
- `npm run test:carga`: compras (sin cambios) y `plataforma.carga.ts` (nuevo).
- `npm run typecheck`, `npm run lint`, `next build`: limpios.

## Lo que tenés que configurar vos (en orden)

Lo que ya estaba (Cloudflare, Traefik, Postgres, la app, volumen, dominio, Resend, primer staff)
sigue igual en `docs/despliegue.md`. **Nuevo**:

1. **Mercado Pago de Deoco** (la cuenta donde entran las cuotas, no la de una banda): crear una
   aplicación de suscripciones y copiar el **Access token de producción** →
   `DEOCO_CUOTA_MP_TOKEN` en las variables de la app.
2. En esa aplicación → **Webhooks**: URL
   `https://app.deoco.com/avisos/plataforma/comercial/cuota/mercadopago`, eventos de
   suscripciones; la **clave secreta** → `DEOCO_CUOTA_MP_SECRETO_AVISOS`.
3. Recomendada: `DEOCO_CUOTA_RESPONDER_A` (casilla de Deoco a la que responden las bandas los
   mails del alta, la mora y la suspensión). Opcional: y `DEOCO_CORREO_DIAS_ADJUNTOS` / `_CUERPO` / `_BORRAR` (plazos de limpieza).
4. `DEOCO_CORREO=smtp` ya no es opcional en la práctica: sin mail no hay alta sola.
5. Con tu usuario de staff, en `/admin/m/comercial/planes`: **precios en pesos** de Esencial,
   Medium y Premium (sin precio no se pueden elegir); revisar espacio y topes de cada plan
   (sembrados como punto de partida) y los plazos (14 días de prueba de Medium, 3 de gracia, 10
   de mora).
6. Bandas que ya existan antes de este despliegue: quedan "Sin cuenta" (sus módulos no se tocan)
   hasta que les asignes un plan en Cuentas → la banda.
7. El día del despliegue: `docs/verificacion-despliegue.md` §12 (cuota con Mercado Pago real) y
   §13 (alta sola con mails reales).

## Queda abierto

- **Mercado Pago real**: los campos de suscripciones y cobros autorizados se leen a la defensiva y
  se probaron contra el falso; confirmarlos con la cuenta de Deoco (verificación §12).
- **Sin prorrateo**: cambiar de plan es inmediato y el monto nuevo va desde el próximo cobro.
- **El Pro y los planes a medida no se cobran solos**: los arregla el staff; el barrido no los
  pasa a mora.
- **Más réplicas de la app**: el techo es CPU de un proceso; antes de sumar réplicas, el orden
  por banda del bus de eventos (cola en memoria) tiene que pasar a la base.
- **Advertencias en el log** de la imagen: Prisma no detecta la versión de OpenSSL (ya estaba;
  instalar `openssl` en la imagen no se pudo desde este entorno) y `pg` avisa una vez de una
  consulta en paralelo dentro de una transacción: es del intérprete de Prisma con `adapter-pg`, no
  de nuestro código; revisarlo al pasar a `pg@9`.
- **Antiabuso de la alta sola**: sin captcha; si aparece abuso real, es el próximo paso.

## Próximo paso sugerido

Desplegar y hacer la verificación §12 con un plan de $ 100 antes de poner los precios reales.
