# Planes

Fuente: `docs/decisiones-3.2-respondidas.md` (núcleo d1, d2, d5 y d6; cierre). Están en la
migración `20261124100001_comercial_planes_32`. El staff los edita en `/admin/m/comercial/planes`.

## La grilla

| Plan | Estado | Precio de referencia | Productos publicados | Shows publicados por mes | Imágenes del sitio | Entradas por mes (solo mide) | Dominio propio | Espacio (red de seguridad) |
|---|---|---|---|---|---|---|---|---|
| **Demo** | a la venta | 8 USD/mes | 5 | 1 | 30 | 200 | no (subdominio) | 1,5 GB |
| **Escenario** | a la venta (también es el plan de la prueba) | 24 USD/mes | 30 | 6 | 150 | 2.000 | sí | 10 GB |
| **Gira** | definido y cerrado | 56 USD/mes | 100 | 20 | 600 | 10.000 | sí | 36 GB |
| **Sello** | definido y cerrado | por banda, a convenir | 100 por banda | 20 por banda | 600 por banda | 10.000 por banda | sí | 36 GB por banda |

- **Shows por mes**: publicados con fecha en un mismo mes calendario (hora argentina).
- **Entradas por mes**: nunca cortan una venta. Lo que pasa del tope se ve en Plan y pago con el
  plan y el complemento que lo cubren (no se cobra solo).
- **Complementos sueltos** (3.2 núcleo d6): "Un show más este mes", "1.000 entradas más". Los
  define el staff; la banda los compra en Plan y pago para el mes que elige.

Reglas generales:

- Los tres módulos (sitio, tienda, ticketera) están en todos los planes. Los planes se distinguen
  por sus topes, no por los módulos (núcleo d2).
- Los precios de referencia siguen la relación 1/3/7 (8 · 24 · 56). Los precios en pesos quedan
  vacíos hasta que el staff los carga; sin precio, un plan no se puede elegir.
- No hay plan gratuito. La prueba dura 14 días, usa el plan Escenario y no es un plan.
- Los planes cerrados (Gira y Sello) no aparecen para elegir. Los asigna el staff cuando alguien
  los pide.

Sello:

- Se vende aparte, a partir de tres bandas, con precio por banda decreciente. El modelo lo admite
  como plan cerrado con su grilla por banda.
- El precio decreciente y la vista del manager no están construidos (módulo `manager`, etapa 2).

## Qué pasa al cambiar de plan

- **Subir de plan a mitad del período** (núcleo d6):
  - los límites se amplían enseguida;
  - la diferencia proporcional por los días que quedan se suma al próximo cobro de la
    suscripción, una sola vez, y después vuelve el precio del plan (`cargoPendiente`,
    `diferenciaProporcional`).
  - No se arma un pago aparte: la plata sigue entrando por la suscripción.
- **Bajar de plan** no corta nada que esté vendido o abierto. Si el plan nuevo no incluye un
  módulo que tiene algo en curso, ese módulo sigue prendido como excedente y se cobra el plan
  que lo incluye hasta que lo abierto se cierra (C1.1).
- **Productos de más**: los que exceden el tope pasan a borrador, empezando por los últimos
  creados. No se borra nada.
- **Shows a la venta**: nunca se despublican.
- **Dominio propio**: un plan sin dominio propio (Demo) deja de mostrar el sitio en el dominio de
  la banda y lo manda al subdominio. El dominio sigue siendo de la banda: puede llevárselo, y no
  puede sumar dominios nuevos (`tenant.dominiosPropios`).
- **Cambio de precio de un plan**: lo ya pagado del período no cambia. El precio nuevo rige
  desde el próximo cobro de cada suscripción (dinero d5).

## El espacio: la cuenta de los siete años

El 3.2 (núcleo d2) dice que el espacio no se vende: es una red de seguridad que equivale a unos
siete años de una banda que usa su plan al máximo. Los consumos al tope que trae el 3.2 son:

- Demo: 0,20 GB por año.
- Escenario: 1,45 GB por año.
- Gira: 5,10 GB por año.

Esos consumos salen de estos pesos por unidad: foto del press kit 6,6 MB con sus derivados,
producto 30 MB (sobre todo el arte de impresión a 300 dpi), evento 4 MB, lanzamiento 100 MB.

| Plan | Al año | × 7 años | Tope que quedó | Antes (plan equivalente) |
|---|---|---|---|---|
| Demo | 0,20 GB | 1,40 GB | **1,5 GB** | 1 GB (Esencial) |
| Escenario | 1,45 GB | 10,15 GB | **10 GB** | 5 GB (Medium) |
| Gira | 5,10 GB | 35,70 GB | **36 GB** | 20 GB (Premium) |

**Los valores de antes (1 / 5 / 20 / 100) estaban mal:** una banda que usa su plan al máximo
llegaba al tope en 5 años (Demo), 3,4 (Escenario) y 3,9 (Gira). Un tope que se alcanza con el uso
normal deja de ser una red de seguridad. Los cambié por 1,5 / 10 / 36 GB, y 36 GB por banda para
Sello.

Una salvedad sobre los números del 3.2:

- El mismo bloque del documento da también el acumulado al tercer año: 0,29 / 2,79 / 8,14 GB.
- Eso no es tres veces el consumo anual: implica que después del primer año se suma menos.
- Si se toma esa curva, a los siete años quedaría cerca de 0,5 / 5,5 / 14 GB.
- Elegí la lectura lineal (la que pediste, y la más alta) porque la red no tiene que alcanzarse
  nunca con uso normal. Guardar archivos de más cuesta poco; cortar una carga a una banda que
  usa su plan como corresponde cuesta mucho más.

Cuando se llega al tope, se bloquean las cargas nuevas y no se borra ni se despublica nada
(núcleo d6). El mensaje ya no ofrece "pasate a un plan con más espacio" (infra d1): dice que el
espacio alcanza para años de uso normal y que escriban.

## Lo que la grilla nombra y todavía no existe

- **Cobrar el excedente de entradas solo**: hoy se muestra y se sugiere el plan o el complemento.
  Facturarlo automáticamente necesita facturación (no está).
- **Idiomas**: Gira es "sin límite de idiomas". No hay idiomas en el producto.
- **Precio decreciente de Sello** y la vista del manager: ver el módulo `manager`.
