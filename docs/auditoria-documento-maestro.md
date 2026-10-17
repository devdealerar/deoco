# Auditoría contra el documento maestro

Auditoría de lo construido en el repo contra `docs/documento-maestro.md` (16 secciones). Es solo
lectura: no se tocó código. Fecha: 2026-10-16.

## Tercera vuelta (2026-10-17, después de los bloques C y D)

Se volvieron a mirar todas las filas que no estaban en OK. Las que cambiaron llevan **3.ª vuelta:**
con el bloque que lo resolvió y la evidencia. Las cifras del resumen de abajo son las de la primera
vuelta; las de ahora:

| Estado | 1.ª vuelta | 3.ª vuelta |
|---|---|---|
| OK | 39 | 68 |
| DISTINTO | 25 | 14 |
| PARCIAL | 40 | 34 |
| FALTA | 67 | 55 |
| PENDIENTE | 5 | 5 |
| **Total** | **176** | **176** |

**Las 55 FALTA que quedan**, por tema:

- Soporte y estado: 2.6, 12.1–12.3 (tickets, severidades, modo evento), 14.6 y 15.4 (página de estado).
- Proceso: 2.8 (revisión de arquitectura antes de desarrollar).
- Alta guiada: 3.2–3.4 (brief y propuesta de skin).
- Editor del sitio: 4.3 (arrastrar pestañas), 4.9 («Powered by Deoco»), 4.14–4.17 (idiomas).
- Press kit: 5.2 (PDF), 5.4 (enlace privado).
- Central pública de eventos: 6.3–6.6.
- Proveedores (marketplace, etapa 3): 7.6, 7.7, 7.17, 7.18, 7.21–7.30, 7.34, 7.35.
- Pago a proveedores: 8.7 (tarjeta, débito o prepago; depende de B4).
- Ticketing: 9.5 (tandas encadenadas), 9.6 y 9.7 (descuentos y promotores), 9.8 y 9.9 (invitados),
  9.13 (PWA), 9.20 (checklist), 9.22 y 9.23 (lista descargable o impresa: se decidió no hacerla),
  9.27 (cancelación con reembolso masivo), 9.30 (cola de espera).
- Fiscal: 11.2 y 11.3 (integración y credenciales fiscales).
- Comunidad: 13.12 y 13.13 (moderación, denuncia).
- Sitio de Deoco: 15.1 (página pública con planes).

## Antes de leer

**Hay dos documentos maestros.** Esta auditoría se hizo contra el `.md` de 16 secciones, que fue
el que se pidió guardar. El zip que vino antes trae otro documento, cifrado: "Mapa de decisiones
del ecosistema", v3.2, septiembre 2026. Tiene 16 *módulos*, 204 funcionalidades y 53 decisiones
para ratificar. Es mucho más amplio: suma manager y plan Sello, organizador de lanzamiento,
registro de obra, backline, multipaís, dinero y liquidación, infraestructura y salida comercial.
En algunos puntos contradice al `.md`:

- **Brief.** El `.md` dice "una única propuesta inicial de skin". El 3.2 dice "el sistema propone
  tres o cuatro familias de plantilla curadas; la banda elige una".
- **Dominios.** El `.md` prohíbe revenderlos en la primera etapa. El 3.2 habla de "dominios propios
  a escala" y no menciona la reventa.

Las respuestas a sus 53 decisiones no están en el zip. Si manda el 3.2, esta auditoría hay que
rehacerla contra él. Los estados de abajo solo valen para el `.md`.

**Nombres.** "Deoko" es Deoco: no se cuenta como diferencia. El press kit quedó dentro de
`modulos/sitio`: es una diferencia de empaquetado y se auditó contra ese módulo.

**Producción.** No hay evidencia de bandas reales ni de un despliegue en producción. Todo se ensayó
con la imagen de producción contra servicios falsos (Mercado Pago, Cloudflare, GoDaddy, Resend,
SMTP): `docs/despliegue.md:591-669`. La lista del día del despliegue
(`docs/verificacion-despliegue.md`) no tiene ningún resultado anotado. Por eso la gravedad se
ordena por **cuánto daño hace el primer día que se use** y por **si viene prendido por defecto**.
Viene prendido por defecto todo lo que trae la prueba Medium: Sitio y Tienda
(`prisma/migrations/20261103130000_comercial/migration.sql:103`, `docs/despliegue.md:156`).

**Método.** El documento se partió en 176 requisitos atómicos y cada uno se buscó en el código.
Las evidencias son `ruta:línea`. Los puntos más graves (7.32, 8.4, 9.10, 9.11, 9.16, 12.4, 14.1,
14.3, 13.17, 3.1, 4.9, 4.14) se volvieron a abrir y confirmar uno por uno.

---

## 1. Resumen

| Estado | Cantidad |
|---|---|
| **Requisitos** | **176** |
| OK | 39 |
| DISTINTO | 25 |
| PARCIAL | 40 |
| FALTA | 67 |
| PENDIENTE (el documento lo deja abierto) | 5 |

Por sección:

| § | Tema | Req. | OK | DIST. | PARC. | FALTA | PEND. |
|---|---|---|---|---|---|---|---|
| 1 | Propósito y modelo | 7 | 6 | 0 | 1 | 0 | 0 |
| 2 | Núcleo y arquitectura | 8 | 2 | 1 | 3 | 2 | 0 |
| 3 | Suscripción, brief, sitio inicial | 7 | 1 | 2 | 1 | 3 | 0 |
| 4 | Sitios y editor | 17 | 5 | 3 | 2 | 6 | 1 |
| 5 | Press kit | 5 | 1 | 0 | 1 | 2 | 1 |
| 6 | Fechas y central de eventos | 6 | 1 | 0 | 1 | 4 | 0 |
| 7 | Tienda y proveedores | 35 | 4 | 6 | 8 | 17 | 0 |
| 8 | Pagos a proveedores | 8 | 1 | 3 | 2 | 1 | 1 |
| 9 | Ticketing | 32 | 9 | 6 | 4 | 13 | 0 |
| 10 | Área del fan | 5 | 1 | 0 | 1 | 2 | 1 |
| 11 | Facturación y pasarelas | 6 | 1 | 0 | 2 | 2 | 1 |
| 12 | Soporte, suplantación, auditoría | 9 | 1 | 1 | 3 | 4 | 0 |
| 13 | Datos, comunicaciones, cumplimiento | 17 | 5 | 1 | 4 | 7 | 0 |
| 14 | Suspensión, retención, estado | 6 | 1 | 2 | 1 | 2 | 0 |
| 15 | Sitio de Deoco y área privada | 4 | 0 | 0 | 2 | 2 | 0 |
| 16 | Escala inicial | 4 | 0 | 0 | 4 | 0 | 0 |

**En una línea:**
- Lo que se construyó con más cuidado (núcleo multi-tenant, aislamiento, cobros con la pasarela de
  la banda, venta de entradas con cupo, dominios propios) está bien hecho.
- Una cuarta parte del código (dominios y correo de dominio: ~6.200 líneas y ~3.900 de pruebas) es
  algo que el documento no pide o que prohíbe expresamente.
- Mientras tanto faltan piezas que el documento da por básicas: brief, página de Deoco,
  tandas encadenadas, invitados, descuentos, newsletter, soporte, idiomas y exportación de datos.
- Hay dos fallas que hacen daño apenas se use la tienda: el diseño no se congela en la orden, y el
  proveedor produce antes de cobrar.

---

## 2. Lista de DISTINTO, por gravedad

Nada está en producción. La gravedad sale de qué pasa el primer día de uso real y de si viene
prendido por defecto.

| # | Req. | Qué pasa | Por qué va acá |
|---|---|---|---|
| 1 | **7.31 / 7.32** Diseño no congelado | `actualizarProducto` reemplaza `disenoId` en el mismo producto (`modulos/tienda/productos.ts:104-114`, 143-160). El renglón del pedido no guarda el diseño (`modulos/tienda/esquema.prisma:186-215`). El portal del proveedor arma el archivo de impresión con el diseño **actual** (`modulos/tienda/proveedor.ts:104,119,145`). Si la banda cambia el arte con pedidos sin despachar, el proveedor fabrica los pedidos viejos con el arte nuevo. No hay prueba que lo cubra. | Falla de integridad activa. La tienda viene prendida en la prueba Medium. Fabrica mal y cuesta plata. |
| 2 | **8.2 / 8.3 / 8.4** El proveedor produce sin cobrar | Cuando paga el fan, en la misma transacción la orden nace `EN_PRODUCCION` y se anota una deuda (`modulos/tienda/pagos.ts:64-68`, 85-100, 113-116). El proveedor recibe "Producir y enviar" (`modulos/tienda/correos.ts:104-105`). Despachar no mira la deuda (migración `20261029110000_tienda_proveedor_escribe_en_la_base:38-54`). No hay tope de deuda. El documento pide orden pendiente, cobro a la banda por un medio autorizado y producción recién con el cobro confirmado. Decisión registrada en contra: `docs/tareas.md:376-377`. | El proveedor financia la producción, que es lo que §8 prohíbe. Prendido por defecto. |
| 3 | **14.1** Suspensión a los 10 días, y al revés | MOROSO a los 3 días y SUSPENDIDO a los 10 del vencimiento (`modulos/comercial/cuenta.ts:78`; `prisma/migrations/20261103130000_comercial/migration.sql:27-28`). Si la prueba termina sin tarjeta, SUSPENDIDO directo (`cuenta.ts:333-334`). En SUSPENDIDO se cierra el **panel** y el sitio sigue publicado y vendiendo (`src/nucleo/tenant/reglas.ts:48-50`). El documento dice 60 días, despublicar el sitio y bloquear ventas. Decisión registrada: `docs/decisiones-pendientes.md:152-157`, `docs/resumen-planes-cuotas.md:11,21`, `docs/despliegue.md:133-134`. | Se dispara con la primera cuota impaga. Hace exactamente lo contrario de lo que pide el documento. |
| 4 | **14.3** La puerta se cierra con la banda suspendida | La puerta es una ruta del panel (`modulos/ticketera/index.ts:35-36`). SUSPENDIDO → 403 y ARCHIVADO → 404, aunque haya shows vendidos (`reglas.ts:50,53`). Con el punto 3, el sitio sigue vendiendo entradas que después no se pueden escanear. | Deja gente afuera de un show pagado. |
| 5 | **9.16** PUERTA ve más que escanear | `tienda.producto.ver` incluye PUERTA (`modulos/tienda/index.ts:37`), y con eso ve `/tienda/pedidos` y `/tienda/deuda`: nombres y ciudades de fans, montos, pagos duplicados y deuda con proveedores (`modulos/tienda/panel/pedidos.tsx:57-64,83`). También ve el sitio (`modulos/sitio/index.ts:19`). `tests/roles.test.ts:45` lo prueba como si fuera lo deseado. Choca también con la spec (`docs/spec/00-especificacion-nucleo.md:86`). | Expone datos de fans y de dinero a quien solo tenía que escanear. Pasa en toda banda con tienda. |
| 6 | **9.11** El QR no está firmado | Es un código aleatorio de 10 caracteres (`modulos/ticketera/compras.ts:152-154`) y la puerta lo busca en la base (`modulos/ticketera/puerta.ts:29-33`). No hay HMAC. Decisión: `docs/decisiones-pendientes.md:396-397`. | Cambiarlo después de vender obliga a reemitir entradas. Además, sin firma no hay validación sin conexión posible (9.21). |
| 7 | **12.4** No hay suplantación, hay acceso permanente del staff | El staff pasa todos los permisos de cualquier banda salvo `exclusivoTitular`, para siempre, sin pedirlo ni avisar (`src/nucleo/permisos/puede.ts:24-29`). Puede editar precios, productos, shows y contenido. El aviso aparece solo en Inicio (`src/app/b/[slug]/page.tsx:27`). El documento pide una entrada temporal, con aviso visible y registro consultable por la banda. Decisión: `docs/spec/00-especificacion-nucleo.md:51,77`, `docs/tareas.md:684`. | Se usa desde el primer despliegue. Es un tema de confianza con la banda. |
| 8 | **9.15** PUERTA vale para toda la banda | `membresia` = usuario + banda + rol, sin evento (`prisma/schema/nucleo.prisma:74-86`). La invitación la hace solo el staff desde `/admin` (`src/app/admin/_servidor/bandas.ts:271-292`). Decisión: `docs/decisiones-pendientes.md:407-408`. | Todo integrante de puerta queda con acceso a todos los shows, sin vencimiento. |
| 9 | **9.21** Sin conexión no hay plan B | Sin señal, la puerta dice "No lo dejes pasar" (`modulos/ticketera/puerta.ts:1-5`, `panel/puerta-cliente.tsx:134-136`). El documento pide advertir, seguir y reconciliar después. Decisión: `docs/decisiones-pendientes.md:398-404`. | Un venue sin señal deja la puerta parada. |
| 10 | **9.10** Nominadas siempre | Toda entrada exige nombre y documento (`modulos/ticketera/compras.ts:19,32-36,200`). No hay opción por evento. En la puerta el documento se muestra, pero el sistema no lo coteja (`panel/puerta-cliente.tsx:215`). | Fricción en la compra de todo show. El documento las pide opcionales. |
| 11 | **9.29** Tope por compra, no por comprador | `MAXIMO_POR_COMPRA = 10` fijo (`compras.ts:18`). El mismo email puede repetir compras. La banda no lo configura. Decisión: `docs/decisiones-pendientes.md:384`. | No sirve para los shows de alta demanda, que es para lo que existe. |
| 12 | **3.1** No se paga primero | Registro → prueba de 14 días de Medium sin tarjeta (`modulos/comercial/cuenta.ts:124-152`). Decisiones: `docs/decisiones-pendientes.md:150,180,215`. | Es otro modelo comercial que el del documento. |
| 13 | **3.6** No se entrega una plataforma armada | El sitio queda en "Estamos preparando el sitio" hasta que la banda lo carga y publica (`modulos/sitio/publico.tsx:39-49`). Decisión: "No se publica contenido de ejemplo" (`docs/decisiones-pendientes.md:212-214`). | La promesa del alta es justamente que la banda lo recibe hecho. |
| 14 | **13.17** Hay límites desde el día uno | 1 GB de espacio por defecto (`src/nucleo/archivos/index.ts:38`), `exigirLimite` (`src/nucleo/cuenta/index.ts:171-199`): 20/100 productos, 30 shows, 1/5/20/100 GB, y Esencial trae solo el sitio. Decisión: `docs/decisiones-pendientes.md:168-170`. | El documento dice medir sin limitar. Hoy los precios están en NULL, así que nadie elige plan todavía. |
| 15 | **7.2 / 7.10 / 7.11** La banda no elige proveedor | El proveedor va atado al producto base global, o es el de la plataforma (`modulos/tienda/catalogo.ts:148-154`). La banda ve todo el catálogo sin saber quién produce (`modulos/tienda/panel/producto.tsx:72`). Decisión: `docs/tareas.md:378`. | Cambia el modelo de la tienda. Corregirlo toca catálogo y órdenes. |
| 16 | **7.5** El proveedor no tiene catálogo propio | El portal tiene solo órdenes, una orden y cuenta corriente (`modulos/tienda/index.ts:76-80`). El catálogo lo carga el staff (`index.ts:57-63`). Decisión: `docs/tareas.md:383`. | Mientras haya pocos proveedores lo puede cubrir el staff, pero no escala. |
| 17 | **4.6** Prender un módulo no lo decide la banda | La pestaña aparece sola y en un lugar fijo (`src/nucleo/modulos/navegacion.ts:16-20`; `orden` en cada contrato). Los módulos los prende el staff o el plan. | Experiencia del editor. Sin riesgo. |
| 18 | **4.1** Una sola plantilla | Logo, fondo, dos colores y 3 tipografías (`modulos/sitio/esquema.prisma:18-37`). Decisión: "no hay plantillas distintas por banda en el tramo 1" (`docs/spec/00-especificacion-nucleo.md:162`). | Limita la identidad visual. Sin riesgo. |
| 19 | **4.12** Se construyó la reventa de dominios | Compra, cobro, renovación, vencimiento, transferencia, cambio de titular y privacidad WHOIS con GoDaddy (detalle en §5 de esta auditoría). Decisiones: `docs/diseno-dominios.md:13,22,197,389,527`, `docs/tareas.md` D7–D12. | Es la contradicción más grande en esfuerzo (~5.100 líneas). En daño es baja: queda apagada si no se configura `DEOCO_REGISTRADOR` (`src/nucleo/dominios/venta.ts:49`) y nunca tocó un servicio real. |
| 20 | **2.1** "Sitios" no es núcleo | Contenido, identidad y publicación viven en `modulos/sitio`. El núcleo da el ruteo y el `marcoPublico`. Decisión: `docs/spec/00-especificacion-nucleo.md:17`. | Arquitectura. No se nota en el uso. |

Las 20 filas cubren los 25 requisitos DISTINTO: algunas agrupan varios, como 7.31 y 7.32, 8.2 a
8.4, y 7.2, 7.10 y 7.11.

---

## 3. Lista de FALTA, por cuánto bloquea el uso real

### Bloquea salir a vender, o deja un riesgo que no se puede dejar abierto

| Req. | Falta | Por qué bloquea |
|---|---|---|
| 15.1, 15.2, 4.9 | Página pública de Deoco y "Powered by Deoco" en el pie | No hay de dónde captar bandas: la raíz del dominio da 404 (`docs/despliegue.md:115-116`). El pie dice solo `© año nombre` (`modulos/sitio/vista/marco.tsx:75-77`). El "Powered by" necesita esa página para enlazarla. |
| 3.2, 3.3, 3.4 | Brief guiado y skin generada | El alta pide solo nombre y subdominio (`src/app/registro/banda/page.tsx:26-36`). Es el corazón de §3. |
| 9.5 | Tandas encadenadas | Todos los tipos se venden a la vez (`modulos/ticketera/eventos.ts:184-185`). Preventa → general es lo mínimo de cualquier show. |
| 9.8, 9.9 | Invitados con cupo e ingreso separado | Toda entrada exige pago (`docs/decisiones-pendientes.md:385,395`). Todo show tiene lista de invitados. |
| 9.6, 9.7 | Descuentos y promotores | Nada en esquema ni código. Son herramientas de venta básicas. |
| 9.22, 9.23 | Lista de contingencia y reconciliación | Junto con 9.21: si el venue no tiene señal, no hay forma de hacer entrar a la gente. |
| 9.25 | Reenviar una entrada perdida | El mail sale una sola vez (`modulos/ticketera/correos.ts:64`) y sus adjuntos se borran a los 7 días. Es el pedido de soporte más común. |
| 9.27 | Cancelación con reembolso masivo | No hay estado cancelado ni devolución (`modulos/ticketera/esquema.prisma:62-67`). La postura registrada es "Deoco no devuelve nada". |
| 14.5, 13.1 | Exportar datos (contactos, pedidos, entradas) | Nada (grep `csv`, `exportar`). Es obligatorio para la salida de una banda y para §14. |
| 7.34, 7.35, 13.12, 13.13 | Declaración de derechos, denuncia, baja y moderación | Ninguno existe. Es riesgo legal desde el primer diseño que se suba. |
| 12.1 | Soporte por tickets | No existe. Hoy no hay ningún canal. |
| 4.14–4.17 | Estructura de idiomas | No hay nada (`<html lang="es">` fijo, `src/app/layout.tsx:21`; textos de un solo idioma). No bloquea lanzar en español. Pero el documento la pide "desde el inicio" y cada tabla nueva la encarece. |

### Bloquea usar bien un módulo que ya existe

| Req. | Falta |
|---|---|
| 7.6, 7.7 | Panel del proveedor con variantes, precios, tiempos, cobertura, técnicas y requisitos |
| 7.21 | Aprobación del proveedor antes de habilitarlo (nace `activo`, `modulos/tienda/esquema.prisma:18`) |
| 7.28, 7.29, 7.30 | Reclamos, mediación y escalamiento |
| 7.33 | Duplicar un producto (va junto con arreglar 7.31) |
| 8.7 | Algún medio para que el proveedor cobre a la banda (depende de 8.6) |
| 10.1 | "Mis compras" que junte merch, entradas y próximos shows |
| 10.4 | Confirmación por correo de acciones sensibles (no hay ninguna todavía) |
| 13.2, 13.3, 13.4 | Newsletter con doble opt-in, baja y consentimiento |
| 9.13 | PWA de la puerta (no hay manifest ni service worker) |
| 9.20 | Checklist previo al evento |
| 9.24 | Transferencia de entradas |
| 9.30 | Cola de espera |
| 12.9 | La banda ve su auditoría (se escribe y nadie la lee) |
| 5.2, 5.4 | Press kit en PDF y enlace privado |
| 4.3 | Reordenar pestañas (arrastrar y soltar) |

### No bloquea la primera etapa

| Req. | Falta |
|---|---|
| 6.3–6.6 | Central pública de eventos |
| 12.2, 12.3 | Severidades y modo evento (dependen de 12.1) |
| 14.6, 15.4 | Página pública de estado |
| 7.17, 7.18 | Catálogo de capacidades y proveedor integrado por API |
| 7.22–7.27 | Directorio, reseñas, proveedor propio de la banda |
| 11.2, 11.3 | Integración fiscal (ARCA) |
| 13.15 | Vista consolidada del manager |
| 2.6 | Soporte en el núcleo (es lo mismo que 12.1) |
| 2.8 | Revisión de arquitectura por Claude **antes** de desarrollar. No se hizo: el documento entró al repo después de los 50 commits. Esta auditoría es lo más parecido, y llega tarde. |

---

## 4. Tablas por sección

### §1 · Propósito y modelo de producto

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 1.1 | Plataforma modular | OK | `src/nucleo/modulos/contrato.ts:334`, `registro.ts:141`, `scripts/descubrir-modulos.mjs` | El núcleo nunca nombra un módulo (`tests/modulos.test.ts`). |
| 1.2 | Sitio propio por banda | OK | `src/proxy.ts:55-58`; `prisma/migrations/20261104100000_autogestion/migration.sql:81,91-93` | Subdominio en el alta. |
| 1.3 | Identidad visual propia | OK | `modulos/sitio/esquema.prisma:18-35`, `panel/identidad.tsx:15-40` | Acotada: logo, fondo, dos colores, 3 tipografías (ver 4.1). |
| 1.4 | Panel de administración | OK | `src/app/b/[slug]/page.tsx`, `marco.tsx` | |
| 1.5 | Sumar funcionalidades sin reconstruir | OK | `src/nucleo/modulos/encendido.ts:56,84` | Tienda y ticketera entraron como módulos. Hubo que tocar el núcleo de forma genérica (portal, cobros). |
| 1.6 | Primer módulo: press kit | OK | `modulos/sitio/index.ts:33,38`; `docs/tareas.md:595` | Dentro de `sitio`. |
| 1.7 | Tienda, ticketing, proveedores, soporte y central sobre el mismo núcleo | PARCIAL | `modulos/tienda`, `modulos/ticketera`, portal (`modulos/tienda/index.ts:75-79`) | Faltan soporte y central de eventos. |

### §2 · Núcleo común y arquitectura

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 2.1 | Bandas, sitios y dominios en el núcleo | DISTINTO | `prisma/schema/nucleo.prisma:45,93`; `modulos/sitio` | Los sitios son un módulo (`docs/spec/00-especificacion-nucleo.md:17`). |
| 2.2 | Usuarios, roles y permisos | OK | `nucleo.prisma:28,74`; `src/nucleo/acceso/roles.ts:8`; `src/nucleo/permisos/puede.ts` | |
| 2.3 | Suscripciones, planes y facturación de la plataforma | PARCIAL | `modulos/comercial/cuenta.ts:121-160`, `esquema.prisma`; `src/nucleo/cuenta` | Planes y cuota existen, pero en un módulo, no en el núcleo. **No se factura la cuota:** no hay comprobante ni historial de cobros para la banda. |
| 2.4 | Auditoría de acciones | OK | `nucleo.prisma:225-238`; `src/app/admin/_servidor/auditoria.ts:10` | La escriben el back office, el staff, secretos, dominios y cuenta. Sitio y ticketera no auditan nada. Nadie la puede leer: no hay pantalla. **3.ª vuelta:** C1.7: `auditoria` inmutable (REVOKE + disparador), `/admin/auditoria` y `/b/<slug>/actividad`; `accionesDelPanel` registra cada guardado de los módulos. |
| 2.5 | Notificaciones | PARCIAL | `src/nucleo/correo/index.ts:154,173`; `deoco.ts:23`; avisos en `src/app/b/[slug]/marco.tsx` | Solo correo y avisos sueltos. No hay centro de notificaciones. |
| 2.6 | Soporte | FALTA | grep `soporte`, `ticket`, `mesa de ayuda` | |
| 2.7 | Módulos activables por etapas | OK | `nucleo.prisma:150` (`ModuloTenant`); `encendido.ts:56-100` | Las dependencias existen pero ningún módulo las usa. |
| 2.8 | Revisión de arquitectura por Claude antes de desarrollar | FALTA | `git log`: el documento entró en el último commit | Hubo repasos posteriores al código (`docs/repaso-dominios.md`, `docs/tareas.md:774`), ninguno previo. |

### §3 · Suscripción, brief y creación inicial

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 3.1 | La banda paga primero | DISTINTO | `modulos/comercial/cuenta.ts:124-152` | Prueba de 14 días sin tarjeta. |
| 3.2 | Derivada automáticamente a un brief | FALTA | `src/nucleo/autogestion/index.ts:157` (redirige al panel o a la pasarela) | grep `brief`, `onboarding`, `wizard`: nada. |
| 3.3 | El brief pide identidad y contenido | FALTA | `src/app/registro/banda/page.tsx:26-36` | Solo nombre, subdominio y la opción prueba o plan. |
| 3.4 | Una propuesta de skin generada | FALTA | `modulos/sitio/esquema.prisma:24-25` (`#6941c6`, SANS por defecto) | No se genera nada. |
| 3.5 | Sin rondas ni revisión manual | OK | — | Se cumple solo porque no hay ningún proceso de diseño. |
| 3.6 | Plataforma ya armada | DISTINTO | `modulos/sitio/publico.tsx:39-49` | Sitio vacío "en preparación". |
| 3.7 | Personalizar colores, imágenes, textos, orden de secciones y contenidos | PARCIAL | `modulos/sitio/acciones.ts:58-59,119-123,173-177`; `panel/identidad.tsx` | Todo menos el orden de secciones, que está fijo en `vista/home.tsx` y en el `orden` de los contratos. |

### §4 · Sitios de bandas y editor

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 4.1 | Plantillas flexibles | DISTINTO | `modulos/sitio/vista/marco.tsx`, `vista/home.tsx`; spec:162 | Una sola plantilla. |
| 4.2 | Edición sin código | OK | `modulos/sitio/panel/*`, `acciones.ts:49-238` | |
| 4.3 | Arrastrar y soltar pestañas | FALTA | `src/nucleo/modulos/navegacion.ts:16-20`; `orden` en cada `index.ts` | grep `drag`, `dnd`, `sortable`: nada. La spec decidió "Cuatro pestañas, siempre las mismas" (spec:149). No hay pestaña Contacto. |
| 4.4 | Arrastrar y soltar bloques dentro de la sección | PARCIAL | `modulos/sitio/acciones.ts:31-43,119-127,173-181` | Solo ↑/↓ en slides y links. Los bloques tienen orden fijo. YouTube y Spotify no son bloques. |
| 4.5 | Menú dinámico por módulos prendidos | OK | `navegacion.ts:16-20`; `src/nucleo/publico/marco.tsx:18-31` | |
| 4.6 | La banda agrega y ubica Tienda y Ticketing | DISTINTO | `modulos/tienda/index.ts:94`, `modulos/ticketera/index.ts:46` | Posición fija. Prende el staff o el plan. |
| 4.7 | Bloques predefinidos, editables y reordenables | PENDIENTE | `modulos/sitio/contenido.ts:163-186` | "Se resolverá con Claude". Hoy son predefinidos y editables, pero no reordenables, y no hay un modelo de bloques. |
| 4.8 | Borrador → vista previa → publicación | PARCIAL | `modulos/sitio/contenido.ts:270-285`; `panel/vista-previa.tsx` | Solo en el sitio. Shows y productos se publican en vivo, sin borrador. |
| 4.9 | "Powered by Deoco" en el pie | FALTA | `modulos/sitio/vista/marco.tsx:75-77` | grep `powered`: 0. |
| 4.10 | Dirección inicial | OK | migración `autogestion:91-93` | |
| 4.11 | Dominio propio después | OK | `src/nucleo/dominios/index.ts:413,678,732`; `src/app/b/[slug]/dominios` | |
| 4.12 | No revender dominios en la primera etapa | DISTINTO | `src/nucleo/dominios/{venta,compra,godaddy,registrador,vencimiento,transferencia}.ts`; `src/app/b/[slug]/dominios/comprar/**` | Ver §5 de esta auditoría. |
| 4.13 | Guía para conectar un dominio propio | OK | `src/app/_dominios/lista.tsx:155-170,326-350,407-453` | Es una guía dentro de la pantalla, con los registros a copiar. |
| 4.14 | Estructura multi-idioma desde el inicio | FALTA | `src/app/layout.tsx:21`; `modulos/sitio/esquema.prisma:27-30` | grep `i18n`, `locale`, `idioma`: nada. |
| 4.15 | La banda activa idiomas | FALTA | — | |
| 4.16 | La banda edita sus traducciones | FALTA | — | |
| 4.17 | Estructura, skin y módulos compartidos entre idiomas | FALTA | — | |

### §5 · Press kit (en `modulos/sitio`)

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 5.1 | Versión pública viva | OK | `modulos/sitio/index.ts:33,38`; `vista/prensa.tsx:120-198` | `/prensa`. |
| 5.2 | PDF exportable | FALTA | grep `pdf`: solo tipos de archivo y la medición de la tienda | |
| 5.3 | Descargables: fotos, logos, rider, stage plot, one-sheet | PARCIAL | `modulos/sitio/esquema.prisma:29,76-79` | Faltan stage plot y one-sheet. |
| 5.4 | Enlace privado | FALTA | `modulos/sitio/index.ts:33` (ruta pública); `src/nucleo/archivos/firmados.ts` lo usa solo la tienda | |
| 5.5 | Contenidos "definidos con Claude" | PENDIENTE | spec:154 | Lo que fijó la spec (bio, fotos, rider, logos, contacto) está construido. |

### §6 · Fechas y central de eventos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 6.1 | Cada fecha se carga una vez y alimenta el sitio | OK | `modulos/sitio/fechas.ts:1-31`; `modulos/ticketera/eventos.ts:250-266` | Hay dos fuentes que no se unen: las fechas manuales del sitio y los shows de la ticketera. Al prender la ticketera, las manuales desaparecen del sitio (`fechas.ts:28-31`) y hay que volver a cargarlas. **3.ª vuelta:** A1: las fechas manuales y los shows de la ticketera conviven (misma fecha y sala, una vez). |
| 6.2 | Fecha, ciudad, sala, enlace de entradas | OK | `modulos/sitio/esquema.prisma:47-57`; `modulos/ticketera/esquema.prisma:6-14` | Un show de la ticketera no admite un link externo. |
| 6.3 | Central pública de eventos | FALTA | rutas de `src/app` | |
| 6.4 | Refleja automáticamente los eventos de las bandas | FALTA | — | |
| 6.5 | Redirige a la venta de la banda | FALTA | — | |
| 6.6 | La banda conserva autoría y venta | FALTA | — | Dentro de su sitio sí la conserva. Dentro de una central, no hay central. |

### §7 · Tienda on demand y proveedores

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 7.1 | 100% on demand, sin stock | OK | `modulos/tienda/esquema.prisma` (no hay campo de stock) | |
| 7.2 | La banda elige proveedores | OK | `modulos/tienda/catalogo.ts:148-154`; `docs/tareas.md:378` | Lo asigna el staff por producto base. **3.ª vuelta:** B3: la banda elige la oferta (producto base × proveedor) al crear el producto (`ofertasDe`). |
| 7.3 | Personaliza la base y publica el producto terminado | OK | `modulos/tienda/productos.ts:129-140,167-181` | |
| 7.4 | El fan no personaliza | OK | `modulos/tienda/publico/agregar.tsx:30-66` | Elige variante y cantidad. |
| 7.5 | Panel del proveedor: catálogo base | DISTINTO | `modulos/tienda/index.ts:57-63,76-80` | El catálogo está en `/admin`, no en el portal. |
| 7.6 | Panel del proveedor: variantes, precios, tiempos, cobertura | FALTA | `modulos/tienda/esquema.prisma:40-46` (`costoEnvioPorZona` sin uso) | No hay tiempos ni cobertura. |
| 7.7 | Panel del proveedor: técnicas y requisitos | FALTA | `esquema.prisma:16-17,50-54` | No existe el concepto de técnica. Los requisitos los fija el staff. |
| 7.8 | Panel del proveedor: órdenes, estados, seguimiento, incidencias | PARCIAL | `modulos/tienda/portal/paginas.tsx:18,77,147-151` | Solo hay dos estados (EN_PRODUCCION → DESPACHADO). No hay incidencias. |
| 7.9 | Administración central que aprueba y audita | PARCIAL | `catalogo.ts:68-100`; `admin/proveedores.tsx` | El staff crea y edita, pero no hay flujo de aprobación. |
| 7.10 | La banda conecta o habilita un proveedor | OK | `catalogo.ts:148-154` | **3.ª vuelta:** B3: la banda elige el proveedor por producto; con la oferta retirada, reasigna en un clic. |
| 7.11 | Ve el catálogo de ese proveedor | OK | `modulos/tienda/panel/producto.tsx:72` | Ve todo el catálogo global, sin proveedor. **3.ª vuelta:** B3: ve las ofertas de cada proveedor con costo, envío, plazo y margen. |
| 7.12 | Sube arte, lo ubica en zonas, variantes, nombre, fotos, descripción, precio | PARCIAL | `productos.ts:34-63,81-117`; `esquema.prisma:111-112` | No hay zonas y hay una sola foto por producto. |
| 7.13 | Deoco valida el diseño contra la especificación | PARCIAL | `modulos/tienda/impresion.ts:25-76`; `tests/tienda-panel.test.ts:81-127` | Valida formato, píxeles, dpi y página del PDF, sobre un área única. No valida zonas, colores ni técnicas, porque no existen. |
| 7.14 | Publica el producto | OK | `productos.ts:167-181` | |
| 7.15 | Ficha: áreas, medidas, colores, técnicas, límites, variantes | PARCIAL | `esquema.prisma:39-54` | Hay medidas, formatos y variantes en texto libre. Faltan áreas o zonas, técnicas, colores como especificación y límite de archivo propio. |
| 7.16 | Catálogo común con mapeo por proveedor | PARCIAL | `esquema.prisma:32-64`; `catalogo.ts:35-52` | Las opciones son texto libre ("Talle: S, M"). No hay vocabulario común ni capa de mapeo. |
| 7.17 | Capacidad nueva como opción reutilizable | FALTA | `esquema.prisma:47-49` | |
| 7.18 | Proveedor integrado por API | FALTA | `modulos/tienda/correos.ts:93-147` (la orden sale por mail) | |
| 7.19 | Proveedor manual: recibe, descarga, actualiza estados, carga seguimiento | PARCIAL | `portal/paginas.tsx`; `proveedor.ts:117-124,169-188` | La única acción es despachar. No puede rechazar ni informar un problema. |
| 7.20 | Mismo modelo de órdenes para los dos | PARCIAL | `esquema.prisma:250-274` | Hay un solo modelo, pero no existe el integrado para comprobarlo. |
| 7.21 | Aprobación previa del proveedor | FALTA | `esquema.prisma:18` (`activo` por defecto) | |
| 7.22 | Directorio de proveedores | FALTA | grep `marketplace`, `directorio`, `perfil` | |
| 7.23 | Calificar solo con órdenes reales | FALTA | grep `calific`, `reseñ`, `review` | |
| 7.24 | Calificaciones separadas | FALTA | — | |
| 7.25 | Moderación de reseñas | FALTA | — | |
| 7.26 | Banda como proveedor propio | FALTA | `catalogo.ts:68` | Solo el staff crea proveedores. |
| 7.27 | Proveedor propio limitado a su banda | FALTA | — | |
| 7.28 | Reclamo con evidencia e historial | FALTA | grep `reclamo`, `incidencia`, `disputa` | |
| 7.29 | Mediación de Deoco | FALTA | — | |
| 7.30 | Escalamiento automático | FALTA | `src/nucleo/barrido.ts` | |
| 7.31 | Cambiar el diseño crea un producto nuevo | OK | `productos.ts:104-114,143-160` | Se cambia en el mismo producto. **3.ª vuelta:** B5 (y el 3.2): con un pedido pagado, cambiar el arte crea una versión (`tienda_diseno.reemplazaAId`) e historial. |
| 7.32 | Las órdenes conservan el diseño original | OK | `esquema.prisma:186-215`; `proveedor.ts:104,119,145` | **Bug activo.** **3.ª vuelta:** A1: cada renglón guarda su `disenoId`. |
| 7.33 | Duplicar una configuración | OK | grep `duplic` (solo pagos duplicados) | **3.ª vuelta:** A1: `duplicarProducto`. |
| 7.34 | La banda declara derechos sobre lo que sube | FALTA | `modulos/tienda/panel/disenos.tsx:31-44` | |
| 7.35 | Denuncia y baja rápida | FALTA | grep `denuncia` | |

### §8 · Pagos a proveedores

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 8.1 | El dinero del fan va a la cuenta de la banda | OK | `modulos/tienda/pagos.ts:20-31`; `tests/tienda-pago.test.ts:118-149` | |
| 8.2 | La orden se crea pendiente | DISTINTO | `esquema.prisma:242-245,264` | Nace `EN_PRODUCCION`. |
| 8.3 | El proveedor cobra a la banda por un medio autorizado | DISTINTO | `esquema.prisma:217-219`; `pagos.ts:85-100`; `docs/tareas.md:376-377` | Solo se anota una deuda. |
| 8.4 | Producción liberada solo con el cobro confirmado | DISTINTO | `correos.ts:104-105`; migración `…tienda_proveedor_escribe_en_la_base:38-54` | Se libera con el pago del fan. |
| 8.5 | Dos movimientos separados; la diferencia es margen | PARCIAL | `productos.ts:239-252` | El margen se calcula. El segundo movimiento no existe. |
| 8.6 | Investigar MP, PayPal, Stripe y locales | PENDIENTE | — | No hay investigación escrita. |
| 8.7 | Tarjeta, débito o saldo prepago | FALTA | grep `prepago` | "Saldar" es una marca manual del proveedor (`proveedor.ts:225-243`). |
| 8.8 | Referencia única por orden | PARCIAL | `proveedor.ts:28`; `pagos.ts:25` | Se muestran 8 caracteres del UUID del pedido. Con dos proveedores, las dos órdenes tienen el mismo número. |

### §9 · Ticketing

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 9.1 | Solo online | OK | `modulos/ticketera/publico/acciones.ts:16-50`; `compras.ts:65-130` | |
| 9.2 | QR único | OK | `compras.ts:152-154`; `esquema.prisma:127` | Único por banda. |
| 9.3 | Tipos con nombre libre | OK | `esquema.prisma:36-57` | |
| 9.4 | Precio, cupo y período por tanda | OK | `esquema.prisma:43-48`; `compras.ts:74-75`; CHECK en la migración `ticketera:36` | |
| 9.5 | Al agotarse o vencer, se habilita la siguiente | FALTA | `eventos.ts:184-185` | |
| 9.6 | Códigos de descuento | FALTA | grep `descuento`, `cupon` | |
| 9.7 | Códigos de promotor | FALTA | grep `promotor` | |
| 9.8 | Listas de invitados | FALTA | grep `invitad` | |
| 9.9 | Ingreso de invitados separado | FALTA | — | |
| 9.10 | Nominadas activables por evento, verificadas en puerta | DISTINTO | `compras.ts:19,32-36` | Siempre obligatorias. En la puerta solo se muestran. |
| 9.11 | QR firmado | OK | `compras.ts:152-154`; `correos.ts:11-12` | Sin firma. **3.ª vuelta:** A1: QR firmado con HMAC por banda (`firma.ts`). |
| 9.12 | Valida real, del evento y no usado; marca ingresado | OK | `puerta.ts:33-44`; `tests/ticketera.test.ts:227-258` | Con 6 validaciones simultáneas pasa una sola. |
| 9.13 | PWA | FALTA | sin manifest ni service worker | |
| 9.14 | Invitación individual y revocable | OK | `src/app/admin/_servidor/bandas.ts:271-292,309-326` | Individual y revocable, pero solo la hace el staff y sin mail. **3.ª vuelta:** D7: el titular invita por email con el rol Puerta y lo saca desde Equipo (cesa al instante). |
| 9.15 | Limitada al evento | DISTINTO | `nucleo.prisma:74-86` | Vale para toda la banda. |
| 9.16 | Solo escaneo, sin admin ni pagos | OK | `modulos/tienda/index.ts:37`; `modulos/sitio/index.ts:19` | Ve pedidos, montos y deuda. **3.ª vuelta:** A1: el único permiso de PUERTA es `ticketera.puerta.validar`. |
| 9.17 | Registra quién escaneó | OK | `esquema.prisma:124`; `puerta.ts:37` | Se guarda. Ninguna pantalla lo muestra. |
| 9.18 | Validación online | OK | `panel/acciones.ts:130-133` → `puerta.ts:18-46` | |
| 9.19 | Estado de conexión de los escáneres | PARCIAL | `panel/puerta-cliente.tsx:134` | Cada teléfono ve el suyo. No hay vista general. |
| 9.20 | Checklist previo | FALTA | grep `checklist` | |
| 9.21 | Sin conexión: avisar y reconciliar | DISTINTO | `puerta.ts:1-5` | Sin conexión no deja pasar a nadie. |
| 9.22 | Lista descargable y registro manual | FALTA | `docs/decisiones-pendientes.md:398-404` | Decisión de no hacerlo. |
| 9.23 | Lista impresa y carga posterior | FALTA | ídem | |
| 9.24 | Transferencias | OK | grep `transfer` | **3.ª vuelta:** D5: transferencia con doble confirmación por mail; el QR viejo deja de valer (la puerta dice «transferida»). |
| 9.25 | Reenvío sin duplicar | OK | `correos.ts:64` | **3.ª vuelta:** D5: `reenviarEntradas` (mismas entradas, 3 por día), desde la compra y desde Mis compras. |
| 9.26 | Reprogramación | PARCIAL | `eventos.ts:42-52` | Se edita la fecha y las entradas siguen. No hay aviso a los compradores ni devolución. |
| 9.27 | Cancelación con reembolso masivo | FALTA | `eventos.ts:114-121`; `esquema.prisma:62-67` | |
| 9.28 | Reportes en tiempo real | PARCIAL | `panel/paginas.tsx`; `puerta.ts:51-65` | Los ingresados se ven solo en la puerta. No se separan pagas e invitados. El panel no se refresca solo. |
| 9.29 | Límite por comprador | OK | `compras.ts:18` | 10 por compra, fijo. **3.ª vuelta:** C1.8 y D0: frenos por compra, por persona, por email e IP, configurables por show. |
| 9.30 | Cola de espera | FALTA | grep `cola`, `espera` | |
| 9.31 | Reserva temporal del cupo | OK | `compras.ts:17,52-59,98,120-126`; `tests/ticketera.test.ts:139` | 20 minutos. |
| 9.32 | Sin butacas en la primera etapa | OK | grep `butaca`, `asiento`, `seat`: 0 | No se construyó, como pide el documento. |

### §10 · Área del fan

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 10.1 | "Mis compras" | OK | `modulos/ticketera/index.ts:40`; `modulos/tienda/index.ts:69` | Una página suelta por compra, por módulo y por banda. **3.ª vuelta:** D5: `/mis-compras` con los pedidos y las entradas (QR) de cada módulo (`areaDelFan`). |
| 10.2 | Acceso por enlace seguro, sin contraseña | OK | `src/nucleo/publico/acceso.ts:16-29`; `canjear-link.tsx`; `compras.ts:229-238` | Un link por compra. No hay "mandame el acceso" a pedido. **3.ª vuelta:** D5: «mandame el link» a pedido: un solo uso, 30 minutos, el anterior deja de servir. |
| 10.3 | Contraseña opcional más adelante | PENDIENTE | — | El documento lo deja para después. |
| 10.4 | Confirmación por correo para acciones sensibles | OK | — | No hay ninguna acción sensible del fan todavía. **3.ª vuelta:** D5: transferir una entrada se confirma por mail. |
| 10.5 | Datos del fan aislados por banda | OK | migración `ticketera:93-96`; `acceso.ts:17-23`; `tests/ticketera.test.ts:206,227-247` | |

### §11 · Facturación y pasarelas

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 11.1 | La banda factura; Deoco registra órdenes | PARCIAL | `modulos/tienda/esquema.prisma:140`; `modulos/ticketera/esquema.prisma:70` | Las órdenes se registran. La banda no tiene ningún soporte para facturar. **3.ª vuelta:** C1.10: cada venta guarda la foto fiscal (vendedor, comprador, renglones, IVA): la banda tiene los datos para facturar. Sigue sin integración. |
| 11.2 | Integraciones fiscales por país | FALTA | grep `arca`, `afip`, `factura`, `país` | El tenant no tiene país. |
| 11.3 | Credenciales fiscales propias | FALTA | `src/nucleo/pagos/index.ts:29-31` | Solo están las de la pasarela. |
| 11.4 | Integración progresiva, con asesoría | PENDIENTE | — | |
| 11.5 | Pasarelas del país de la banda, con sus credenciales | PARCIAL | `src/nucleo/pagos/index.ts:25,66`; `mercadopago.ts:256,269-273` | Las credenciales son de la banda, pero hay una sola pasarela (MP) con moneda ARS fija. |
| 11.6 | Deoco no retiene fondos | OK | `mercadopago.ts:269-283` (sin `marketplace_fee` ni split) | Salvedad: Deoco sí recibe dinero propio, la cuota y la venta de dominios (ver 4.12). |

### §12 · Soporte, suplantación y auditoría

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 12.1 | Tickets de soporte | FALTA | grep `soporte`, `severidad` | |
| 12.2 | Severidades de 1 h, 8 h y 24 h | FALTA | — | |
| 12.3 | Modo evento | FALTA | — | |
| 12.4 | Entrada temporal sin contraseña | OK | `src/nucleo/permisos/puede.ts:24-29`; `src/nucleo/acceso/panel.ts:52-63` | Acceso permanente del staff. **3.ª vuelta:** D3: sesión de soporte con motivo y vencimiento (15/30/60 min), permisos de gestor. |
| 12.5 | Aviso visible | OK | `src/app/b/[slug]/page.tsx:27` | Solo en Inicio, y solo lo ve el staff. **3.ª vuelta:** D3: aviso en todo el panel mientras dura (al staff y a la banda). |
| 12.6 | Permisos recortados (sin pagos ni facturación) | OK | `puede.ts:29`; `exigirTitular` en `/pago`, `/credenciales`, `/dominios`, `/correo` | No toca la pasarela ni la cuota. Sí ve pedidos con montos y edita precios. |
| 12.7 | Registro consultable por la banda | OK | `src/nucleo/acceso/registro-staff.ts:10-31` | Se escribe una fila cada 10 minutos. Nadie la puede leer. **3.ª vuelta:** D3 y C1.7: la banda ve las visitas del soporte y lo que hizo en Actividad. |
| 12.8 | Auditoría de publicaciones, precios, transferencias, soporte, configuración, reclamos | PARCIAL | `src/app/admin/_servidor/*`; `src/nucleo/secretos/carga.ts:133,158`; `src/nucleo/dominios/*` | No se auditan publicaciones, precios ni la ticketera. Reclamos y transferencias no existen. **3.ª vuelta:** C1.7: se auditan los guardados del panel (publicar, precios), soporte, equipo, dominios, cuota. Transferencias en su tabla. Falta: reclamos (no existen). |
| 12.9 | La banda consulta sus movimientos | OK | grep `auditoria` en `src/app/b` y `modulos`: solo escrituras | **3.ª vuelta:** C1.7: `/b/<slug>/actividad`. |

### §13 · Datos, comunicaciones y cumplimiento

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 13.1 | Base de contactos exportable | OK | grep `newsletter`, `contactos`, `csv` | **3.ª vuelta:** D4 y D-infra: la base de fans va entera (con el consentimiento) en la exportación. |
| 13.2 | Doble opt-in | OK | — | **3.ª vuelta:** D4: doble confirmación por mail. |
| 13.3 | Baja en un clic | OK | — | **3.ª vuelta:** D4: baja en un clic (link y `List-Unsubscribe` RFC 8058). |
| 13.4 | Registro de consentimiento | OK | — | **3.ª vuelta:** D4: fecha, texto que vio y origen del consentimiento. |
| 13.5 | Verificar el dominio para enviar correo | OK | `src/nucleo/dominios/correo.ts`, `envio.ts`; `src/nucleo/correo/remitente-banda.ts` | |
| 13.6 | Guía paso a paso | OK | `src/app/b/[slug]/correo/page.tsx:29-67` | |
| 13.7 | Remitente temporal | OK | `remitente-banda.ts:6-9` | |
| 13.8 | No se sube música ni video | OK | `src/nucleo/archivos/tipos.ts:2,15-28` | |
| 13.9 | Insertar o enlazar Spotify y YouTube | PARCIAL | `modulos/sitio/esquema.prisma:60-70`; `vista/home.tsx:104-131` | Solo como links. No se insertan, no hay bloques. |
| 13.10 | Galería acotada | PARCIAL | `modulos/sitio/esquema.prisma:39-48,76-87` | Hay galería. La cantidad no tiene tope: solo la cuota de espacio. |
| 13.11 | Textos y diseños | OK | `modulos/sitio/esquema.prisma:27-30`; `modulos/tienda` | |
| 13.12 | Moderación | FALTA | — | |
| 13.13 | Denuncia y baja | FALTA | — | |
| 13.14 | Analítica | PARCIAL | `modulos/tienda/inicio.ts:11-40`; `modulos/ticketera/inicio.ts` | Solo contadores de ventas. No hay visitas, geografía, repetición ni mailing. **3.ª vuelta:** D4: geografía, repetición y crecimiento del mailing en Fans; ventas en el inicio. Faltan visitas y rendimiento por producto. |
| 13.15 | Vista consolidada del manager | OK | `src/app/page.tsx:36-55` | Solo una lista de bandas. **3.ª vuelta:** D7: portal del manager (roster, calendario, comparar, exportar), solo agregados. |
| 13.16 | Medición de espacio, correos, tráfico y picos | PARCIAL | `src/nucleo/archivos/index.ts:41-46`; `src/app/admin/page.tsx:49,86` | Solo se mide el espacio. |
| 13.17 | Sin límites iniciales | DISTINTO | `src/nucleo/archivos/index.ts:38`; `src/nucleo/cuenta/index.ts:171-199` | |

### §14 · Suspensión, retención y estado

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 14.1 | 60 días, después se despublica y se bloquean ventas | OK | `modulos/comercial/cuenta.ts:78`; `reglas.ts:48-50` | 10 días, con el panel cerrado y el sitio vendiendo. **3.ª vuelta:** B1: escalera de 60 días (aviso, solo lectura a 30, suspendido a 60). |
| 14.2 | No se borran órdenes, entradas ni registros | OK | `tests/comercial.test.ts:262-275`; no hay borrados de pedidos, compras ni entradas | Ojo: la limpieza de correos borra filas a los 365 días (14.4). |
| 14.3 | El escaneo sigue con eventos vendidos | OK | `modulos/ticketera/index.ts:35-36`; `reglas.ts:50,53` | **3.ª vuelta:** A1: la puerta sigue con la banda cerrada para los shows vendidos. |
| 14.4 | Conservación por el plazo legal | PARCIAL | `src/nucleo/correo/limpieza.ts:15-33` | No hay política de retención. Lo único que se borra son los correos (adjuntos a 7 días, cuerpo a 90, fila a 365), incluidos los de entradas y compras. |
| 14.5 | Exportación de datos | OK | grep `csv`, `exportar` | **3.ª vuelta:** D-infra: exportación completa (zip CSV + JSON + archivos), sin trámite, en todo estado. |
| 14.6 | Página pública de estado | FALTA | grep `estado`, `status`, `incidente` | |

### §15 · Sitio de Deoco y área privada

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 15.1 | Página pública con producto, planes y beneficios | FALTA | `docs/despliegue.md:115-116`; `src/app/page.tsx:30` | La raíz da 404. |
| 15.2 | Registrarse o ingresar desde ahí | PARCIAL | `src/app/ingresar/page.tsx:36-37`; `src/app/registro` | Existen, pero no hay página que lleve a ellos. |
| 15.3 | Área privada: sitios, proveedores, productos, eventos, plan, facturación, soporte | PARCIAL | `src/app/page.tsx:39`; navegación de los módulos; `src/app/b/[slug]/pago` | Faltan proveedores (del lado de la banda), facturación y soporte. |
| 15.4 | Estado vinculado desde el panel y visible sin sesión | FALTA | — | |

### §16 · Escala inicial

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| 16.1 | 100 bandas, escenario alto 300 | PARCIAL | `tests/carga/plataforma.carga.ts:17` (30 bandas); `tests/carga/dominios.test.ts:17` (200, solo dominios) | La carga mezclada se probó con 30 bandas. Techo de ~65 pedidos/s en el contenedor de desarrollo. No se midió en el VPS (`docs/despliegue.md:667-669`). |
| 16.2 | Eventos de 20 a 500 personas | PARCIAL | `tests/carga/compras.test.ts:60,76`; `http.carga.ts:18-19` | La venta se probó con 300 a 400 compradores simultáneos. **El escaneo no tiene ninguna prueba de carga.** |
| 16.3 | Simple y escalable en picos de venta y escaneo | PARCIAL | `src/nucleo/db/config.ts`; `src/nucleo/eventos/bus.ts:19,34,41-49` | Una instancia. El orden del bus, el freno por IP y la cola de GoDaddy viven en la memoria del proceso. |
| 16.4 | Ampliable sin rediseñar | PARCIAL | `docs/resumen-planes-cuotas.md` ("Queda abierto") | Para tener réplicas hay que rehacer la entrega del bus. |

---

## 5. Lo que se construyó y el documento no pide

Escala total: ~25.400 líneas propias (sin `src/components`/`src/ui`), ~14.000 de pruebas y 58
migraciones. **Dominios y correo de dominio: ~6.200 líneas (~24 % del código) y ~3.900 de pruebas
(~28 %).** Nada de eso tocó nunca un servicio real.

### Contradice al documento

| Qué | Dónde | Tamaño | Contra qué |
|---|---|---|---|
| **Reventa de dominios** (compra, cobro, renovación, vencimiento, gracia, pérdida, transferencia, cambio de titular, privacidad WHOIS, devoluciones) | `src/nucleo/dominios/{compra 652, venta 188, godaddy 247, registrador 127, vencimiento 193, transferencia 106, seguimiento 148, cola 37, plazos 13}.ts`; `modulos/comercial/dominios.ts` (481) y `admin/dominios.tsx` (163); `src/app/b/[slug]/dominios/comprar/**` y `compras/**` (576); `src/app/admin/dominios` (214); `src/nucleo/pagos/cuota.ts:100-138` | ~3.150 líneas propias, más lo repartido en `index.ts`, `salida.ts` y `lista.tsx`. 8 migraciones (258 líneas SQL). ~1.840 líneas de pruebas | §4: "Deoco no revenderá dominios en la primera etapa". Se construyó cada cosa que el documento nombra para justificar no hacerlo. Depende de GoDaddy Reseller (endpoints "SIN CONFIRMAR", `docs/diseno-dominios.md:620-626`). |
| El dinero de los dominios entra a Deoco | `docs/diseno-dominios.md:389-390`; `docs/repaso-dominios.md:16` | — | §11: "no retiene fondos". Es venta propia, pero con devoluciones a cargo de Deoco. |
| Topes por plan y cuota de espacio | `src/nucleo/cuenta/index.ts:171-199`; `src/nucleo/archivos/index.ts:35-38`; migración `cuenta_limites` | — | §13: "No implica límites iniciales". |
| Estados MOROSO / SUSPENDIDO / ARCHIVADO con sus plazos y efectos | `src/nucleo/tenant/reglas.ts:39-58`; `modulos/comercial/cuenta.ts` | — | §14 (ver DISTINTO 3 y 4). |
| Cuenta corriente con el proveedor, que salda el propio proveedor | `modulos/tienda/proveedor.ts:193-243`; `/tienda/deuda`; `admin/deudas.tsx` | — | Reemplaza el cobro previo de §8. |
| PUERTA ve tienda y sitio | `modulos/tienda/index.ts:37`; `modulos/sitio/index.ts:19` | — | §9.16. |

### Funcionalidad de producto que no se pide

| Qué | Dónde | Notas |
|---|---|---|
| Delegación de zonas DNS (`jump_start`, `.com.ar` asistido, vencimiento a 14 días, pasar de CNAME a delegado) | `src/nucleo/dominios/index.ts` (parte), `cloudflare.ts`, `bind.ts`; migraciones `dominios_delegados`, `dominios_transiciones` | Deoco pasa a ser el DNS de terceros. Roza la contradicción: §4 descarta "administrarlos". |
| Salidas ("Llevarme el DNS", 90 días, banda archivada con Dominios abierto, "solo el DNS") | `src/nucleo/dominios/salida.ts` (334); `tests/salida.test.ts`, `tests/salidas.test.ts` | Existe por la delegación y la compra. |
| Recepción y reenvío de correo (Email Routing → Worker → KV → Resend) | `infra/cloudflare/reenvio/worker.js`; `correo.ts` (parte) | §13 pide solo enviar. Tiene un riesgo marcado "CRÍTICO" abierto: un mail se puede perder (`docs/diseno-dominios.md:591-597`). |
| Varios dominios por banda con 307 al principal y revisión cada 6 h | `src/nucleo/dominios/index.ts:732-850` | Sirve a §4, pero va bastante más allá. |
| Cuatro planes con nombre (Esencial, Medium, Premium, Pro) y prueba de 14 días | `modulos/comercial` | El documento habla de planes sin definirlos. La prueba gratis contradice el orden de §3. |
| Pago tardío y `EN_REVISION`, pagos duplicados | `modulos/ticketera/compras.ts:172-188`; `src/nucleo/pagos/registro.ts` | Razonable: cubre un caso real de MP. |
| Metadatos para compartir (OG) | `modulos/sitio/publico.tsx:335-363` | Menor. |
| Proveedor por defecto de la plataforma | `modulos/tienda/catalogo.ts:68-77,111-125` | Parte de la decisión de 7.2. |
| `alertasAdmin` | contrato | Nació para las devoluciones de dominios fallidas. |

### Infraestructura no pedida que sostiene algo pedido (sin objeción)

Bus de eventos, consultas entre módulos, secretos por banda con rotación de clave, avisos externos
(webhooks), cuentas externas y portal, barrido, verificación de arranque, módulo `prueba`
(excluido del build), back office con BYPASSRLS, limpieza de correos, Cloudflare delante de todo
(AOP, Traefik). La limpieza de correos roza §14: borra los mails de entradas y compras a los 365
días.

---

## 6. Decisiones registradas que contradicen al documento

El documento manda, aunque la decisión haya sido aprobada en el chat. Cada una llegó al código.

| # | Decisión (dónde) | El documento dice |
|---|---|---|
| 1 | Comprar dominios en Deoco; "revendedor del registrador" (`docs/diseno-dominios.md:22,197,527`; `docs/tareas.md` D7–D13) | §4: no revender en la primera etapa |
| 2 | "La excepción al dinero se amplía: la cuota y el dominio comprado" (`docs/diseno-dominios.md:389-390`) | §11: no retiene fondos |
| 3 | Privacidad WHOIS incluida y activada (`docs/tareas.md:44`; `docs/decisiones-pendientes.md:46-52`) | §4 |
| 4 | Calendario de renovación, gracia, pérdida, transferencia y cambio de titular (`docs/decisiones-pendientes.md:88-112`) | §4: "agregaría renovaciones, vencimientos, cobros, transferencias y soporte" |
| 5 | Delegar zonas en nuestra cuenta (`docs/tareas.md:19-26`; `docs/diseno-dominios.md:12-15`) | §4: conectar un dominio, con una guía |
| 6 | Topes y espacio sembrados (`docs/decisiones-pendientes.md:168-170`) | §13: sin límites iniciales |
| 7 | MOROSO a 3 días y SUSPENDIDO a 10; fin de la prueba sin tarjeta → SUSPENDIDO (`docs/decisiones-pendientes.md:152-157`) | §14: 60 días |
| 8 | SUSPENDIDO = panel 403 y sitio 200 (`docs/tareas.md:683`) | §14: despublicar el sitio, bloquear ventas, el escaneo sigue |
| 9 | Prueba de 14 días sin tarjeta (`docs/resumen-planes-cuotas.md:11`; `docs/decisiones-pendientes.md:180-182`) | §3: pagar primero |
| 10 | "No se publica contenido de ejemplo" (`docs/decisiones-pendientes.md:212-214`) | §3: plataforma ya armada a partir del brief |
| 11 | "Cuatro pestañas, siempre las mismas" (`docs/spec/00-especificacion-nucleo.md:149`) | §4: arrastrar y soltar pestañas y bloques |
| 12 | "No hay plantillas distintas por banda en el tramo 1" (spec:162) | §4: plantillas flexibles |
| 13 | "Deuda con el proveedor: se registra por orden, no se cobra" (`docs/tareas.md:376-377`) | §8: cobro previo |
| 14 | "Proveedor por producto base, con uno por defecto" (`docs/tareas.md:378`) | §7: la banda elige el proveedor |
| 15 | Catálogo y proveedores desde el back office (`docs/tareas.md:383`) | §7: panel del proveedor |
| 16 | "Lo que se edita en uno publicado se ve al guardar" (`docs/tareas.md:414-415`) | §7: un cambio de diseño crea un producto nuevo |
| 17 | "No hice un modo sin conexión con la lista descargada" (`docs/decisiones-pendientes.md:398-404`) | §9: contingencia sin conexión |
| 18 | PUERTA es un rol por banda (`docs/decisiones-pendientes.md:407-408`) | §9: invitación limitada al evento |
| 19 | "Precio mayor a cero: no hay entradas gratis" (`docs/decisiones-pendientes.md:385-386`) | §9: listas de invitados |
| 20 | Entradas siempre nominadas (`modulos/ticketera/esquema.prisma:69`) | §9: nominadas activables por evento |
| 21 | QR = código de 10 caracteres (`docs/decisiones-pendientes.md:396-397`) | §9: QR firmado |
| 22 | Tope de 10 por compra (`docs/decisiones-pendientes.md:384`) | §9: límite por comprador |
| 23 | El staff entra a cualquier banda (`docs/spec/00-especificacion-nucleo.md:51,77`; `docs/tareas.md:684`) | §12: suplantación temporal, con aviso y registro para la banda |
| 24 | Sitios fuera del núcleo; planes fuera del núcleo (spec:17,19; `docs/decisiones-pendientes.md:136`) | §2: sitios y planes en la base común |

Abiertas en `docs/decisiones-pendientes.md` que el documento ya resolvía (no estaban abiertas):

- **Ya no hacen falta:** D13.2–D13.5, D12.4, D12.5 y D11.2 (todo lo de reventa). Sobran si no se
  revende.
- **Sin conexión en la puerta** ("si hace falta, se puede sumar", `:402-404`): el documento la exige.
- **Entradas sin pago** ("si hace falta", `:385-386`): el documento exige invitados.
- **Topes** (P1.11, "para revisar"): sin límites.
- **Plazos de mora** (P1.5, P1.6): 60 días, y el escaneo sigue.
- **Deuda que salda el proveedor** (C.7): cobro previo.
- **"No hay ENTREGADO"** (C.5): el documento pide estado de envío para el fan, e incidencias.
- **Plazos de limpieza de `evento` y `correo`** (bloque 4.4): conservar por el plazo legal.

Documentación desactualizada que apareció de paso:

- `docs/diseno-dominios.md:3` dice "diseño, sin código" y `docs/tareas.md:3` dice "sin código
  todavía", pero D1–D13 están hechas.
- `docs/despliegue.md:213` dice "todavía sin pantallas: D10", y las pantallas ya existen.
- `modulos/ticketera/esquema.prisma:96-97`, `docs/decisiones-pendientes.md:397` y
  `docs/tareas.md:269` siguen diciendo que el token va en `?t=`. Ya va después de "#".

---

## 7. Definiciones pendientes (no son errores)

Lo que el documento deja abierto, o sin el número que hace falta para construirlo:

| Tema | Lo que dice el documento | Lo que falta definir |
|---|---|---|
| **Cuál documento manda** | — | El `.md` o el 3.2. Si es el 3.2, hacen falta las respuestas a sus 53 decisiones. |
| Bloques del sitio (4.7) | "Se resolverá con Claude" | Qué bloques tiene cada sección. |
| Contenido del press kit (5.5) | "Será definido con Claude" | Qué lleva el one-sheet, el stage plot y el PDF. |
| Cobro al proveedor (8.6) | "Debe investigarse" MP, PayPal, Stripe y locales | La investigación. Sin ella, 8.3, 8.4 y 8.7 no se pueden cerrar. |
| Integración fiscal (11.4) | "Validarse con asesoría contable" | Asesoría y país por país. |
| Contraseña del fan (10.3) | "Más adelante" | Cuándo. |
| Plazo de respuesta del proveedor (7.30) | "Plazo definido" | El plazo. |
| Devolución al reprogramar (9.26) | "Cuando aplique" | Cuándo aplica. |
| Plazo legal de conservación (14.4) | "Plazo legal aplicable" | El plazo. El 3.2 dice diez años en Argentina. |
| Galería acotada (13.10) | "Acotada" | Cuántas fotos. |
| Requisitos del proveedor (7.21) | "Puede incluir muestras…" | Qué se exige para aprobar a un proveedor. |
| Planes (2.3, 15.1) | "Planes y beneficios" | Qué incluye cada plan, si no hay topes (§13). |
