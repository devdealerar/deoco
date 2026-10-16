# Auditoría contra el 3.2: segunda vuelta

Esta es la segunda vuelta de la auditoría. Compara lo construido con `docs/decisiones-3.2-respondidas.md`, que es la fuente de verdad. Es solo lectura, con una excepción que se cuenta en «Antes de leer». Fecha: 2026-10-16, después del bloque B (B0–B5).

Cubre dos cosas:

1. **Los 8 módulos del 3.2 que el maestro no tiene**: manager, lanzamiento, dinero, obra, backline, infraestructura, multipaís y la «salida comercial».
2. **Los casos de borde y las decisiones ratificadas** de los módulos que ya se auditaron contra el maestro (`docs/auditoria-documento-maestro.md`):
   - reglas transversales;
   - núcleo;
   - sitio;
   - panel;
   - público;
   - tienda;
   - proveedor;
   - ticketing;
   - fiscal.

   Lo que la primera auditoría ya marcó acá no se repite, se cita.

## Antes de leer

- **Método.** Cada sección del 3.2 se partió en requisitos atómicos: cada respuesta ratificada y cada caso de borde de «¿Se ratifican los casos de excepción?». Cada requisito se buscó en el código. Las evidencias se dan como `ruta:línea`, verificadas leyendo el archivo. Los hallazgos de la sección 5 se volvieron a abrir uno por uno.
- **Estados.**
  - OK / DISTINTO / PARCIAL / FALTA: igual que en la primera auditoría.
  - PENDIENTE: el 3.2 lo deja abierto.
  - NO APLICA: es organizativo, no software (dotación, guardia, laboratorio).
- **«Salida comercial» no es `modulos/comercial`.** La sección del 3.2 trata de cómo se vende Deoco: el guion y qué se promete. El módulo `comercial` del repo es otra cosa: la cuota, los planes, la escalera de mora y la venta de dominios, que el 3.2 trata en el núcleo (d1–d6). Comparten el id por casualidad.
- **Etapas** (c3):
  - infraestructura: 0;
  - núcleo y backline: 1;
  - sitio, panel, manager, público, lanzamiento y salida comercial: 2;
  - tienda, proveedor y dinero: 3;
  - ticketing y obra: 4;
  - multipaís: 5;
  - fiscal: 6.
  
  La tienda y la ticketera ya están hechas. Por eso las faltas de dinero y fiscal pesan sobre módulos que ya existen.
- **Se tocó una cosa.** Los textos de la cuota seguían diciendo «el sitio sigue online / el panel queda suspendido», y desde B1 eso es falso. Se corrigieron en `modulos/comercial/panel/pago.tsx`, `modulos/comercial/cuenta.ts` y `src/app/b/[slug]/marco.tsx`.

---

## 1. Resumen

| Estado | Cantidad |
|---|---|
| **Requisitos** | **175** |
| OK | 35 |
| DISTINTO | 16 |
| PARCIAL | 27 |
| FALTA | 88 |
| PENDIENTE | 4 |
| NO APLICA (organizativo) | 5 |

| Sección del 3.2 | Etapa | Req. | OK | DIST. | PARC. | FALTA | PEND. | N/A |
|---|---|---|---|---|---|---|---|---|
| Transversales (td1–td3) | — | 5 | 2 | 0 | 2 | 1 | 0 | 0 |
| Núcleo (casos de borde) | 1 | 15 | 4 | 3 | 5 | 3 | 0 | 0 |
| Sitio (casos) | 2 | 6 | 1 | 1 | 1 | 3 | 0 | 0 |
| Panel (casos) | 2 | 3 | 1 | 0 | 0 | 2 | 0 | 0 |
| Manager y plan Sello | 2 | 7 | 2 | 0 | 1 | 4 | 0 | 0 |
| Público y fan (casos) | 2 | 9 | 3 | 1 | 0 | 5 | 0 | 0 |
| Organizador de lanzamiento | 2 | 9 | 0 | 0 | 0 | 9 | 0 | 0 |
| Salida comercial | 2 | 3 | 2 | 0 | 0 | 1 | 0 | 0 |
| Tienda (casos) | 3 | 13 | 3 | 1 | 2 | 6 | 1 | 0 |
| Proveedores y directorios | 3 | 14 | 4 | 2 | 0 | 7 | 1 | 0 |
| Dinero y liquidación | 3 | 20 | 3 | 3 | 4 | 10 | 0 | 0 |
| Ticketing (casos) | 4 | 10 | 4 | 1 | 3 | 2 | 0 | 0 |
| Registro de obra | 4 | 15 | 0 | 0 | 0 | 14 | 1 | 0 |
| Facturación fiscal | 6 | 6 | 0 | 0 | 0 | 6 | 0 | 0 |
| Backline | 1 | 17 | 4 | 1 | 2 | 5 | 0 | 5 |
| Infraestructura | 0 | 15 | 1 | 3 | 4 | 7 | 0 | 0 |
| Multipaís | 5 | 8 | 1 | 0 | 3 | 3 | 1 | 0 |

**En pocas líneas:**

- **Lo diferido** está bien diferido: manager, lanzamiento, obra, multipaís y fiscal no existen. Ninguno bloquea vender, salvo un dato que fiscal y multipaís piden guardar **desde la primera venta**: la condición fiscal y el país de destino. Hoy no se guarda.
- **Lo grave de esta vuelta** está en lo que ya existe:
  - bajar de plan corta ventas abiertas y deja pagos cobrados sin registrar;
  - no hay conciliación de pagos;
  - se aceptan pagos tardíos sin revalidar;
  - las entradas se pueden acaparar sin freno;
  - la infraestructura no tiene copias externas ni monitoreo.
- **Tres reglas inviolables (td3) quedan rotas o débiles:**
  - no hay exportación, y una banda archivada no ve sus datos;
  - la app puede borrar y reescribir la auditoría;
  - las acciones del panel de los módulos no dejan registro.

---

## 2. Lista de DISTINTO, por gravedad

| # | Req. | Qué pasa | Por qué va acá |
|---|---|---|---|
| 1 | **N.5** Un tope o una cuota nunca cortan una operación | Bajar de plan apaga módulos sin mirar ventas abiertas. El camino es `elegirPlan`/`guardarPlan`/`asignarPlan` → `aplicarPlan` (`modulos/comercial/cuenta.ts:110-123`) → `fijarModulos`, que borra la fila (`src/nucleo/cuenta/index.ts:78-80`). Premium → Medium apaga la ticketera; a Esencial, la tienda. Ver hallazgo 5.1. | Deja fans cobrados sin entradas y gente afuera de un show. Lo puede disparar el titular solo. |
| 2 | **S.1** Dominio propio mal configurado → el subdominio sigue sirviendo | `resolver_banda_por_host` devuelve el principal sin mirar `problemaDesde` (`prisma/migrations/20261028100000_resolver_banda_por_host/migration.sql:10-14`). El proxy redirige con 307 al principal (`src/proxy.ts:56-57`). El barrido marca el problema, pero no cambia el principal (`src/nucleo/dominios/index.ts:831-836`). | Si se rompe el CNAME del principal, también cae el subdominio. Es el caso exacto que el 3.2 quiere evitar. |
| 3 | **I.12** Nodo caído en un evento → la puerta pasa a una lista descargada | Sin conexión «no hay verde» (`modulos/ticketera/puerta.ts:1-5`). No hay lista descargable. Ya estaba como 9.21 en la primera auditoría; el 3.2 lo ratifica como caso. | Deja la puerta parada. |
| 4 | **D.4 / D.6** Crédito prepago, «Crédito con [proveedor]» | Fiado: al pagar el fan, la orden sale y se anota la deuda (`modulos/tienda/pagos.ts:85-117`). La pantalla dice «Deuda con proveedores» (`modulos/tienda/panel/comun.tsx:22`, `pedidos.tsx:103`). Propuesta B4 sin construir. | Ya estaba en la primera auditoría (8.2–8.4). El 3.2 lo cierra como crédito. |
| 5 | **Pr.6 / Pr.8** Producto base discontinuado o proveedor que cierra → no se venden unidades nuevas | Retirar la oferta, desactivar el producto base o desactivar el proveedor no corta la venta de los productos existentes (`modulos/tienda/catalogo.ts:86`; `pedidos.ts:96-108`). **B3 lo hizo así a pedido explícito** («si el proveedor deja de ofrecerlo, los productos existentes siguen andando»), y lo prueban `tests/tienda-ofertas.test.ts:121` y `tests/tienda-panel.test.ts:221`. | **Conflicto entre el pedido de B3 y el 3.2 (d5 de proveedor).** No se tocó: hay que decidir cuál manda. |
| 6 | **F.2** Acceso del fan por enlace de un solo uso | El token es fijo por compra, reutilizable y sin vencimiento (`modulos/ticketera/compras.ts:100,228-238`; `modulos/tienda/pedidos.ts:213`). La cookie dura 1 año (`src/nucleo/publico/acceso.ts:16-23`). El token se guarda en claro. | Un mail reenviado da acceso a las entradas para siempre. |
| 7 | **E.6** Límite por comprador, correo y medio de pago | Solo hay 10 por compra (`modulos/ticketera/compras.ts:19`). Ver 5.4. | Los shows de alta demanda quedan sin protección. |
| 8 | **K.8** Rechazo del medio de pago → reintentos escalonados antes de la mora | El primer rechazo ya pone `moraDesde` y manda el mail (`modulos/comercial/cuenta.ts:317-327`). No espera los reintentos de Mercado Pago (`recycling`). | Avisa mora a quien todavía no está en mora. |
| 9 | **D.11** Cambio de precio del plan → rige hasta el vencimiento del período | Las suscripciones autorizadas quedan con el precio viejo para siempre (`modulos/comercial/cuenta.ts:429-449`). | Deoco pierde ingresos sin enterarse. No daña a la banda. |
| 10 | **N.10** Subir a mitad de período → se cobra la diferencia proporcional | «Sin prorrateo» (`modulos/comercial/cuenta.ts:203-221`). | Ídem. |
| 11 | **N.1** Lanzar con dos niveles, en relación 1/3/7 | Hay 4 planes: 3 a la venta más Pro (`prisma/migrations/20261103130000_comercial/migration.sql:101-106`). | Los edita el staff. Los precios en pesos siguen en NULL. |
| 12 | **N.9** Baja de plan con dominio propio → vuelve el subdominio | El dominio propio no depende del plan. | Decisión de producto pendiente de aplicar. Sin daño. |
| 13 | **Ti.5** Arte más grande que el área → se reencuadra, o se rechaza si pierde contenido | «Más grande que lo pedido está bien» (`modulos/tienda/impresion.ts:48`). No mira la proporción. | Le llega al proveedor un arte con otra proporción. |
| 14 | **I.2 / I.3** Infraestructura gestionada; VPS autogestionado diferido | Es un VPS de Hostinger con Easypanel y Traefik escrito a mano (`docs/despliegue.md:1-5,271-505`; `docs/spec/00-especificacion-nucleo.md:37`). No hay tope de gasto. | Hay que confirmar con el titular qué es la «opción A», porque el d6 nombra a Hostinger. |

---

## 3. Lista de FALTA, por cuánto bloquea el uso real

### Bloquea vender, o deja un riesgo que no se puede dejar abierto

| Req. | Falta | Por qué bloquea |
|---|---|---|
| T.4 | Exportación completa | Es regla inviolable (td3). Además, con ARCHIVADO el panel da 404 salvo Dominios (`src/nucleo/tenant/reglas.ts:87-89`): la banda no ve sus datos. Hay propuesta en `docs/decisiones-pendientes.md`. |
| I.4, I.13 | Copias fuera del nodo y restauración probada | No hay `pg_dump`, ni destino, ni prueba de restauración, ni copia del volumen `/data/archivos`. Si se pierde el VPS, se pierden órdenes, entradas y archivos. |
| D.16 | Conciliación periódica de pagos | Tienda y ticketera dependen solo del aviso. Un aviso perdido deja un pago aprobado sin entregar para siempre. `buscar` por referencia ya existe y solo lo usan los dominios (`modulos/comercial/dominios.ts:448`). |
| F.7 | Reenvío del correo de la entrada | El mail sale una sola vez. Era 9.25 en la primera auditoría; el 3.2 lo ratifica. |
| E.1 | Cancelar un evento con reembolso masivo | No hay estado anulado ni devolución. `Pasarela.devolver` existe (`src/nucleo/pagos/tipos.ts:157-162`, `mercadopago.ts:317`) pero `@/nucleo/pagos` no lo expone. |
| Fi.1 | Condición fiscal del vendedor, identificación del comprador y desglose, en cada orden, **desde el primer día** | No hay CUIT, IVA ni condición fiscal en `tenant`, `tienda_pedido` ni `ticketera_compra`. **Cambia lo que asumió la primera auditoría** (11.1). Cada venta de hoy queda sin poder facturarse después. |

### Bloquea usar bien un módulo que ya existe

| Req. | Falta |
|---|---|
| D.18 | Contracargos y devoluciones de algo ya pagado: vuelve «ya-pagado» y no se anota nada (`src/nucleo/pagos/registro.ts:91-93`). Las entradas siguen válidas. |
| T.5 | Registro de actividad en las acciones del panel de los módulos: `accionesDelPanel` no audita (`src/nucleo/acceso/acciones.ts:33-36`). |
| I.14, I.8 | Monitoreo, salud y alertas: no hay `HEALTHCHECK`, aviso de caída ni alerta de ancho de banda. |
| N.12, N.15, M.7 | La banda gestiona sus miembros y revoca accesos desde el panel: hoy solo puede el staff (`src/app/admin/_servidor/bandas.ts:309-324`). |
| N.14 | Baja o bloqueo de una persona; cerrar las otras sesiones al cambiar la clave (JWT de 30 días con solo `sub`). |
| F.5, F.6, F.9 | Reemitir el link vencido, corregir el email (lo hace la banda) y anonimizar a pedido del fan. |
| K.12 | Eliminación total de la banda con retención de órdenes y comprobantes. |
| Ti.3, Ti.12, Ti.13, Pr.5, Pr.9 | Reclamo por defecto, paquete perdido, no retirado, orden no tomada a tiempo y reclamos de calidad. No hay estados después del despacho; `CANCELADO` existe en el esquema y nunca se asigna. |
| Ti.6, Ti.10 | Variante sin stock del proveedor y dirección fuera de cobertura (`costoEnvioPorZona` sin uso). |
| D.14, D.15, D.19, D.20 | Retención de la orden sin crédito, cancelación por plazo, validación de la carga y saldo al irse: todo el modelo B4. |
| P.1 | Bloqueo de edición concurrente: gana el último que guarda. |
| N.4 | Plantillas curadas: hay una sola (4.1 de la primera auditoría). |
| X.6 | País de destino en cada orden: no hay columna `pais`. Hoy se deduce AR porque solo se aceptan provincias argentinas. **Agregarlo cuesta casi nada y después no se recupera.** |
| D.10 | Arancel de la pasarela guardado en la orden: no se lee `fee_details`. El histórico no se puede recuperar. |
| I.6 | Auditoría particionada por mes con retención «desde el principio». |
| K.1, K.13–K.15 | Soporte por tickets, guardia, página de estado y modo evento. |

### No bloquea la primera etapa

- M.1–M.3, M.6: entorno del manager, plan Sello, vista consolidada y exportación del roster. «Se abren cuando haya clientes».
- L.1–L.9: organizador de lanzamiento entero. Es de la fase 2: sin él, la fase 2 no está completa (C.1).
- O.1–O.14: registro de obra. Antes del esquema hay que decidir si la obra es de la banda o de la persona (O.P).
- Fi.2–Fi.6, X.2–X.5, X.8, D.9, D.13, N.11, S.4–S.6, P.3, Pr.1, Pr.10, Pr.11, Pr.13, Pr.14, E.8, I.5, I.7, C.3.

---

## 4. Tablas por sección

### Transversales

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| T.1 | td1: el dinero de las ventas no pasa por Deoco | OK | `src/nucleo/pagos/mercadopago.ts:269-283`; `src/nucleo/pagos/cuota.ts` | Solo entran la cuota y los dominios, que son servicio. |
| T.2 | td2: la cuenta es del músico | PARCIAL | `prisma/migrations/20261104100000_autogestion/migration.sql:88-90` | Usuario global y varias bandas. Pero el alta sola permite una banda por cuenta para siempre, y la persona no puede irse. Ver B6 en `docs/decisiones-pendientes.md`. |
| T.3 | td3: aislamiento en el motor | OK | `tests/aislamiento.test.ts` | |
| T.4 | td3: exportación siempre | FALTA | `src/nucleo/tenant/reglas.ts:87-89` | Archivada, la banda no ve sus datos. |
| T.5 | td3: registro de actividad obligatorio | PARCIAL | `src/nucleo/acceso/acciones.ts:33-36` | Lo escriben el back office, el staff, la cuenta, los dominios y el proveedor. Las acciones del panel de sitio, tienda y ticketera no. Además, la app puede borrar la auditoría (5.6). |

### Núcleo: decisiones y casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| N.1 | d1: niveles 1/3/7, lanzar con 2 | DISTINTO | `prisma/migrations/20261103130000_comercial/migration.sql:101-106` | 4 planes. |
| N.2 | d2: el espacio es red de seguridad; separan los topes de productos, imágenes y eventos | PARCIAL | `modulos/tienda/index.ts:57`; `modulos/ticketera/index.ts:82` | **No hay tope de imágenes.** El cálculo de «unos siete años» no está en el repo: 1/5/20/100 GB es un punto de partida. Además se vende «más espacio» (`modulos/comercial/cuenta.ts:173-184`, `panel/pago.tsx:31`), contra I.1. |
| N.3 | d3: ninguna consulta cruza bandas | OK | `tests/aislamiento.test.ts` | |
| N.4 | d4: plantillas curadas | FALTA | `modulos/sitio/esquema.prisma:18-37` | |
| N.5 | d5: una cuota nunca corta una operación | DISTINTO | `src/nucleo/cuenta/index.ts:78-80` | Ver DISTINTO 1 y 5.1. |
| N.6 | Tope con venta abierta → nunca se corta | OK | `modulos/ticketera/eventos.ts:66-73`; `tests/comercial.test.ts:152-184` | |
| N.7 | Tope de espacio → se bloquean cargas; no se borra nada | OK | `src/nucleo/archivos/index.ts:113-126`; `tests/archivos.test.ts:108-120` | |
| N.8 | Baja de plan con productos de más → salen los más nuevos, sin borrar | OK | `modulos/tienda/productos.ts:295-309` | |
| N.9 | Baja de plan con dominio propio → vuelve el subdominio | DISTINTO | `src/nucleo/dominios/index.ts` | El dominio no depende del plan. |
| N.10 | Subir a mitad de período → diferencia proporcional | DISTINTO | `modulos/comercial/cuenta.ts:203-221` | |
| N.11 | Evento puntual que excede el plan → complemento | FALTA | grep `complement`, `prorrat` | |
| N.12 | El titular se va → la titularidad pasa a otro | PARCIAL | `src/app/admin/_servidor/bandas.ts:257-265,295-323` | Solo lo hace el staff. La regla está en la app, no en la base. |
| N.13 | Conflicto interno → el titular registrado conserva el control | PARCIAL | `src/nucleo/personas/index.ts:7-11` | Puede haber varios TITULAR; `titularDeBanda` toma el primero. |
| N.14 | Usuario revocado con sesión abierta → cae en el siguiente movimiento | PARCIAL | `src/nucleo/acceso/resolver.ts:15-25`; `src/nucleo/auth/index.ts:15-45` | La membresía sí. A la persona no se la puede dar de baja, y cambiar la clave no cierra otras sesiones. |
| N.15 | La banda revoca al manager desde su panel | FALTA | sin pantalla de miembros en `src/app/b/[slug]` | |

### Sitio: casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| S.1 | Dominio mal configurado → sigue el subdominio | DISTINTO | ver DISTINTO 2 | |
| S.2 | El certificado no se emite → reintento; se sirve por el subdominio | OK | `marcarPrincipal`; `tests/dominios.test.ts:266` | Si después el principal pierde el certificado, pasa lo de S.1. |
| S.3 | Imagen fuera de medida → recorte por punto focal | PARCIAL | `src/nucleo/archivos/index.ts:73-80`; `modulos/sitio/vista/home.tsx:28,59` | El recorte es centrado, sin punto focal. Hay una carrera que puede dejar una imagen rota (5.10). |
| S.4 | Idioma sin traducir → el principal | FALTA | | No hay idiomas. |
| S.5 | Embebido caído → se oculta | FALTA | | No hay embebidos. |
| S.6 | Spam en el contacto → filtro y límite | FALTA | | No hay formulario. |

### Panel: casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| P.1 | Dos personas en el mismo bloque → se bloquea | FALTA | `modulos/sitio/acciones.ts:50-80` | Gana el último. |
| P.2 | Espacio superado → no se borra; se bloquean cargas | OK | | |
| P.3 | Cupo de newsletter | FALTA | | No hay newsletter. |

### Manager y plan Sello

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| M.1 | Entorno del representante con varios artistas | FALTA | `src/app/page.tsx:39-55` | Solo existe el selector «Tus bandas». |
| M.2 | Plan Sello aparte | FALTA | migración comercial:101-106 | Cuadra con «se abre cuando haya clientes». |
| M.3 | Vista consolidada, solo agregados | FALTA | `src/nucleo/cuenta/medicion.ts:10` | |
| M.4 | Nunca se unifican bases de fans | OK | RLS + `resolver.ts:15-25` | |
| M.5 | Una banda del roster deja de pagar → solo esa | OK | `modulos/comercial/esquema.prisma:65-66` | Cuenta por banda. |
| M.6 | Exportar el roster: agregados; los fans, con autorización | FALTA | | |
| M.7 | La banda revoca al manager: cesa ya y no se borra nada | PARCIAL | `resolver.ts:15-25`; `nucleo.prisma:80-92`; `bandas.ts:309-324` | Cesa ya y no se borra nada, pero solo lo hace el staff. |

### Público y fan: casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| F.1 | Sin registro ni contraseña | OK | `src/nucleo/publico/acceso.ts` | |
| F.2 | Enlace de un solo uso | DISTINTO | ver DISTINTO 6 | |
| F.3 | Datos aislados por banda | OK | | |
| F.4 | Misma persona en dos bandas → sin correlación | OK | no hay tabla global de fans | |
| F.5 | Link vencido → uno nuevo; el anterior deja de andar | FALTA | | |
| F.6 | Email mal escrito → lo corrige la banda, con comprobante | FALTA | | |
| F.7 | No recibió el correo → reenvío | FALTA | | |
| F.8 | Transferencia no aceptada → vuelve al emisor | FALTA | | No hay transferencias. |
| F.9 | Baja de datos → se anonimiza y se conserva la orden | FALTA | grep `anonimiz` | Riesgo legal. |

### Organizador de lanzamiento

Los nueve requisitos están en FALTA. El módulo no existe: grep de `lanzamiento`, `campaña`, `hito` y `cronograma` sin resultados.

| ID | Requisito |
|---|---|
| L.1 | Herramienta interna del panel, sin nada en el sitio |
| L.2 | Campaña por lanzamiento con un cronograma armado solo (~20 tareas con dependencias) |
| L.3 | Entregables: piezas gráficas por formato |
| L.4 | Se mueve la fecha → todo se recalcula y se mantienen las distancias |
| L.5 | Faltan menos de 30 días → lo vencido se muestra como atrasado |
| L.6 | Hito vencido → aparece en el inicio. Ojo: el inicio corta en 8 pendientes por bloque (`src/nucleo/inicio/index.ts:31`) |
| L.7 | Pieza fuera de medida → «no conforme», no bloquea |
| L.8 | Medidas de plataforma editables por el back office. El mecanismo existe (`tablasGlobales` + `rutasAdmin`); las medidas siguen PENDIENTES en c2 |
| L.9 | Campaña cancelada → se archiva; los archivos quedan en la biblioteca. No hay biblioteca del núcleo |

### Salida comercial

| ID | Requisito | Estado | Detalle |
|---|---|---|---|
| C.1 | Vender la fase 2 como producto terminado | OK en el producto | Los planes describen solo lo que existe. Pero a la fase 2 le falta lanzamiento, mientras se venden tienda y ticketera (fases 3 y 4). |
| C.2 | Lo que viene, sin fecha ni promesa | OK | No hay textos con «próximamente». |
| C.3 | Guion para creativos: el directorio tiene poco tráfico | FALTA | No es código. El directorio es de la etapa 3. |

### Tienda: casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| Ti.1 | d1: el archivo malo se frena antes del proveedor | OK | `modulos/tienda/impresion.ts:50-76`; `tests/tienda-panel.test.ts:83-127` | |
| Ti.2 | d2: mediación como política, escrita en el contrato | PENDIENTE | | Es texto legal. |
| Ti.3 | d3: sin arrepentimiento; reclamo por defecto o despacho; reimprime el proveedor | FALTA | grep `reclamo`, `devoluci` | No se le informa la política al fan. |
| Ti.4 | Arte bajo la resolución mínima → no se publica | PARCIAL | `productos.ts:116-119`; `publicarProducto` no revalida | Si el staff sube la especificación, lo publicado queda como está (5.13). |
| Ti.5 | Arte más grande → reencuadre o rechazo | DISTINTO | `impresion.ts:48` | |
| Ti.6 | Variante sin stock → se oculta esa variante | FALTA | `pedidos.ts:109` | |
| Ti.7 | Precio menor al costo → se permite y se avisa | OK | `productos.ts:366-375`; `tienda-panel.test.ts:202` | |
| Ti.8 | Denuncia de derechos → baja preventiva y descargo | FALTA | | Era 7.35 en la primera auditoría. Ver 5.3. |
| Ti.9 | Dos proveedores → envíos con plazos propios | PARCIAL | `pedidos.ts:140-149`; `pagos.ts:113-116` | Una orden por proveedor. El plazo (`tienda_oferta.plazoDias`) no llega a la orden ni al fan. |
| Ti.10 | Fuera de cobertura → el checkout no deja terminar | FALTA | `esquema.prisma:43-44` | |
| Ti.11 | Dirección inválida → se valida al cargarla | OK | `pedidos.ts:167-202`; `tienda-publica.test.ts:244` | |
| Ti.12 | Paquete perdido → reimpresión o reembolso | FALTA | `esquema.prisma:278-281` | |
| Ti.13 | El fan no retira → reenvío o reembolso menos el envío | FALTA | `CANCELADO` nunca se asigna | |

### Proveedores y directorios

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| Pr.1 | d1: directorios como vitrina | FALTA | | Etapa 3. |
| Pr.2 | d2: suscripción sí, comisión no | OK | | |
| Pr.3 | d3: hipótesis a validar | PENDIENTE | | |
| Pr.4 | d4: no se cobra por contacto | OK | | |
| Pr.5 | No toma la orden en plazo → escalamiento | FALTA | | No existe el paso de «tomarla». |
| Pr.6 | Discontinúa un producto base → no se venden unidades nuevas | DISTINTO | `catalogo.ts:86`; `pedidos.ts:96-108` | Choca con B3: ver DISTINTO 5. |
| Pr.7 | Cambia el costo → solo para lo que viene | OK | `catalogo.ts:334-347`; `tienda-ofertas.test.ts:112` | |
| Pr.8 | El proveedor cierra → se despublican sus productos; lo en curso se completa o reembolsa | DISTINTO | `catalogo.ts:86` | Ídem. |
| Pr.9 | Reclamos de calidad → revisión y suspensión | FALTA | | |
| Pr.10 | Perfil inactivo → se despublica | FALTA | | No hay perfiles. |
| Pr.11 | Reseña con trabajo declarado por las dos partes | FALTA | | |
| Pr.12 | Conflicto con creativo o venue → Deoco no media | OK | | Se cumple porque no hay directorio. |
| Pr.13 | Evento falso en la central → baja | FALTA | | No hay central. |
| Pr.14 | Venue que no cumple → reporte | FALTA | | |

### Dinero y liquidación

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| D.1 | d1: el dinero no pasa por Deoco | OK | `src/nucleo/pagos/index.ts:44-54,77-93` | |
| D.2 | Sin comisión sobre ventas | OK | `modulos/tienda/panel/comun.tsx:68-71` | |
| D.3 | La banda liquida al proveedor desde la plataforma | PARCIAL | `modulos/tienda/proveedor.ts:222-241` | La transferencia es afuera; el proveedor marca lo saldado. |
| D.4 | Crédito prepago | DISTINTO | `modulos/tienda/pagos.ts:85-117` | Fiado. |
| D.5 | El crédito se muestra y se descuenta, sin custodia | FALTA | | Propuesta B4. |
| D.6 | «Crédito con [proveedor]» | DISTINTO | `panel/comun.tsx:22` | |
| D.7 | d3: la calculadora calcula y muestra | PARCIAL | `modulos/tienda/productos.ts:351-376` | Solo el margen. |
| D.8 | d3: dice que es información, no una operación | PARCIAL | `panel/comun.tsx:68-71` | |
| D.9 | d4: siempre como estimación; el arancel lo fija la pasarela | FALTA | grep `estimaci`, `arancel` | |
| D.10 | d4: la orden guarda el arancel vigente | FALTA | `src/nucleo/pagos/mercadopago.ts:299-315` | |
| D.11 | Cambio de precio del plan → hasta el vencimiento | DISTINTO | `modulos/comercial/cuenta.ts:429-449` | |
| D.12 | Baja voluntaria → hasta fin del período, sin reintegro | OK | `cuenta.ts:277-287`; `tests/comercial.test.ts:239-243` | Pero después recibe los mails de la escalera como si debiera (5.15). |
| D.13 | Créditos agotados → se bloquea solo esa función | FALTA | | Etapa 4. |
| D.14 | Sin crédito → orden retenida | FALTA | `modulos/tienda/esquema.prisma:281-284` | |
| D.15 | Plazo vencido sin financiar → cancelación y reembolso | FALTA | | El plazo está abierto (B4, punto 1). |
| D.16 | Acreditado sin aviso → conciliación | FALTA | | Ver 5.2. |
| D.17 | Pago duplicado → se detecta y se devuelve el excedente | PARCIAL | `src/nucleo/pagos/registro.ts:91-100` | La devolución es a mano. Hay una carrera en la tienda (5.7). |
| D.18 | Contracargo → la banda lo ve reflejado | FALTA | `registro.ts:91-93` | |
| D.19 | Carga no validada → no acredita; plazo y escalamiento | FALTA | | B4, punto 2. |
| D.20 | Saldo sin usar y la banda se va → es del proveedor | FALTA | | |

### Ticketing: casos

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| E.1 | Evento cancelado → reembolso masivo; entradas anuladas | FALTA | `modulos/ticketera/esquema.prisma:62-67` | |
| E.2 | Reprogramado → siguen las entradas; ventana de devolución | PARCIAL | `eventos.ts:42-52` | No se avisa ni hay ventana. |
| E.3 | Último cupo → se reserva al iniciar el pago | OK | `compras.ts:44-51,66-88`; `ticketera.test.ts:127` | |
| E.4 | Pago caído → el cupo se libera al vencer | OK | `compras.ts:18,54-60`; `ticketera.test.ts:139` | |
| E.5 | Cambia el precio entre tandas → rige el del inicio, dentro de la ventana | PARCIAL | `compras.ts:171-178` | Un pago tardío se acepta igual (5.8). |
| E.6 | Límite por comprador | DISTINTO | `compras.ts:19` | |
| E.7 | Agregar cupo → lo vendido no cambia | OK | `eventos.ts:113-130`; `ticketera.test.ts:81` | |
| E.8 | Promotor que se va → código desactivado | FALTA | | No hay promotores. |
| E.9 | QR ya usado → rechazo y registro del intento con hora y dispositivo | PARCIAL | `puerta.ts:47-49` | Rechaza, pero no guarda el intento repetido. |
| E.10 | QR de otro evento o vencido → rechazo sin marcar | OK | `puerta.ts:32,38-39`; `ticketera-qr.test.ts:72-100` | |

### Registro de obra

O.1–O.14 FALTA (grep de `obra`, `sadaic`, `inpi`, `dnda` y `transcrip` sin resultados). Son:

- orientar sin ejecutar trámites;
- la documentación de cada organismo;
- el estado de avance;
- subir la grabación;
- melodía con cifrado y letra;
- el paquete de créditos;
- el borrador con revisión humana;
- nombre ya registrado;
- organismo que no responde;
- transcripción con errores;
- audio inaudible antes de consumir crédito;
- porcentajes de autores que sumen 100 (conviene un CHECK);
- requisitos editables por el back office;
- derivar a una gestoría.

**O.P PENDIENTE**: ¿la obra es de la banda o de la persona (td2)? Se decide antes del esquema.

### Facturación fiscal

| ID | Requisito | Estado | Detalle |
|---|---|---|---|
| Fi.1 | Desde el primer día, cada orden guarda la condición fiscal del vendedor, la identificación del comprador y el desglose | FALTA | Ver la lista de FALTA. |
| Fi.2 | Banda no formalizada → comprobante no fiscal | FALTA | |
| Fi.3 | Rechazo del organismo → reintento; la venta no se frena | FALTA | |
| Fi.4 | Credenciales fiscales vencidas → cola | FALTA | |
| Fi.5 | Factura pedida después → con los datos ya capturados | FALTA | Depende de Fi.1. |
| Fi.6 | Reembolso facturado → nota de crédito | FALTA | |

### Backline

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| K.1 | Soporte por tickets con severidad | FALTA | | |
| K.2 | d1: con eventos futuros vendidos, el escaneo sigue | OK | `modulos/ticketera/puerta.ts:73-90`; `src/nucleo/acceso/banda-cerrada.ts`; `tests/banda-cerrada.test.ts:52-84` | Por la cuota, sí. **Un cambio de plan la corta** (5.1). |
| K.3 | d2: separar soporte de laboratorio | NO APLICA | | |
| K.4 | d3: qué no cubre la ciberseguridad | NO APLICA | | No hay un documento de alcance. |
| K.5 | d4: dotación | NO APLICA | | |
| K.6 | d5: automatizar primero alta y autogestión | OK | `src/nucleo/autogestion` | |
| K.7 | d5: laboratorio y crecimiento | NO APLICA | | |
| K.8 | Rechazo del medio de pago → reintentos antes de la mora | DISTINTO | `modulos/comercial/cuenta.ts:317-327` | |
| K.9 | Mora con órdenes en producción → se completan; las nuevas se bloquean | OK | `src/nucleo/pagos/index.ts:85-88` | Las nuevas se bloquean en SUSPENDIDO (día 60). |
| K.10 | Mora con evento vendido → el escaneo sigue | OK | | |
| K.11 | Regulariza después del corte → vuelve todo, intacto | PARCIAL | `cuenta.ts:311-315`; `src/nucleo/cuenta/index.ts:49` | Desde ARCHIVADO hace falta el staff. Ver 5.5. |
| K.12 | Eliminación total con retención | FALTA | | |
| K.13 | Incidente crítico → guardia y página de estado | FALTA | | |
| K.14 | Severidad mal clasificada → reclasificación | FALTA | | |
| K.15 | Modo evento con poca antelación | FALTA | | |
| K.16 | Soporte entra al panel: motivo registrado y sesión auditada | PARCIAL | `src/nucleo/acceso/registro-staff.ts:12-33` | No se pide el motivo. |
| K.17 | Mantenimiento fuera de eventos activos | NO APLICA | | No hay una vista de eventos activos de la plataforma. |

### Infraestructura

| ID | Requisito | Estado | Evidencia | Detalle |
|---|---|---|---|---|
| I.1 | d1: el espacio es red de seguridad; no se vende «más espacio» | PARCIAL | `modulos/comercial/cuenta.ts:173-184`; `panel/pago.tsx:31` | Hoy dice «Para tener más espacio, pasate al plan X». |
| I.2 | d2: sin administración de servidores propia | DISTINTO | `docs/despliegue.md:3-5,58-75,271-505` | |
| I.3 | d3/c2: arrancar gestionada; tope de gasto | DISTINTO | `docs/spec/00-especificacion-nucleo.md:37` | |
| I.4 | Copias fuera del nodo, con restauración probada | FALTA | `docs/despliegue.md:252-255` | |
| I.5 | Dos nodos modestos | FALTA | `src/nucleo/archivos/almacen.ts:18-33,55` | Un solo nodo con disco local. El barrido ya «toma» filas y aguantaría dos nodos. |
| I.6 | Auditoría particionada por mes, con retención | FALTA | `prisma/schema/nucleo.prisma:234-247` | |
| I.7 | Newsletter particionado | FALTA | | No hay newsletter. |
| I.8 | Alerta al 70% del ancho de banda | FALTA | | |
| I.9 | Disco lleno → se bloquean cargas; nada se borra | PARCIAL | `src/nucleo/archivos/index.ts:108-137` | Da un ENOSPC crudo y deja huérfanos (5.11). Postgres está en el mismo disco. |
| I.10 | Ancho de banda → alerta y estáticos en el borde | PARCIAL | `docs/despliegue.md:271,426` | El borde ya es Cloudflare. Falta la alerta. |
| I.11 | Pico de venta → cola y reserva, acotadas al evento | PARCIAL | `modulos/ticketera/compras.ts:18,66-104`; `src/nucleo/db/config.ts:20-28` | Hay reserva. No hay cola. El pool de 40 conexiones es global. |
| I.12 | Nodo caído en un evento → lista descargada | DISTINTO | `modulos/ticketera/puerta.ts:1-5` | |
| I.13 | Corrupción → restaurar priorizando órdenes y entradas | FALTA | | |
| I.14 | Monitoreo y alertas | FALTA | `Dockerfile` | |
| I.15 | Un solo stack | OK | | |

### Multipaís (diferido)

| ID | Requisito | Estado | Detalle |
|---|---|---|---|
| X.1 | Diferido hasta tener la respuesta contable | OK | |
| X.2 | Enrutar por dirección de envío | FALTA (diferido) | |
| X.3 | La ubicación solo preselecciona moneda y catálogo | FALTA (diferido) | Todo está en ARS (`src/nucleo/pagos/registro.ts:21`, `mercadopago.ts:107,217,272`) y en hora argentina fija (`src/nucleo/fechas.ts`). |
| X.4 | Proveedores de Deoco, uno por región | PARCIAL | Los proveedores son globales; no tienen región. |
| X.5 | Por país: proveedor, precio y plazo | PARCIAL | La oferta tiene precio y plazo, sin país. |
| X.6 | País de destino en cada orden desde la fase 3 | PARCIAL | Sin columna (`modulos/tienda/esquema.prisma:172-216`). |
| X.7 | Qué países primero | PENDIENTE | |
| X.8 | Saldo insuficiente con dos órdenes → la segunda espera fondos | FALTA | Depende de B4. |

---

## 5. Mal construido (no estaba en ninguna lista)

Están ordenados por gravedad. Cada uno se verificó leyendo el código.

1. **Bajar de plan corta ventas abiertas y deja pagos sin registrar.**
   - Camino: `elegirPlan` (titular), `guardarPlan` o `asignarPlan` (staff) → `aplicarPlan` → `fijarModulos`, que borra la fila de `moduloTenant` sin mirar shows vendidos ni pedidos en curso (`src/nucleo/cuenta/index.ts:60-85`).
   - Caso: una banda Premium con un show el sábado se pasa a Medium.
   - Desde ese momento:
     - el aviso de Mercado Pago del fan que acaba de pagar da 404 (módulo apagado, `src/nucleo/avisos`). Cobrado y sin entradas;
     - `/puerta` y `/fechas/compra/<id>` dan 404.
   - La prueba `tests/comercial.test.ts:152` no cubre el caso.
2. **No hay conciliación de ventas.**
   - Un aviso perdido deja el pedido o la compra PENDIENTE para siempre: el fan pagó y no hay orden ni entradas.
   - El código sabe buscar por referencia, pero solo lo usan los dominios.
3. **Un pedido de la tienda se paga tarde sin revalidar.**
   - El pedido PENDIENTE no vence nunca: `CANCELADO` no se asigna en ningún lado.
   - `pedidoACobrar` no tiene `antesDePagar` (`modulos/tienda/pagos.ts:41-70`).
   - La preferencia de la banda no vence y admite efectivo.
   - Caso: el producto se baja por una denuncia, o el proveedor ya no lo ofrece, y semanas después el fan paga. El pedido queda PAGADO, la orden va al proveedor con el costo de hoy y el precio de entonces.
4. **Entradas: pago tardío y acaparamiento.**
   - `antesDePagar` de la ticketera solo mira el cupo (`modulos/ticketera/compras.ts:171-178`): no mira `ventaHasta`, la fecha del show ni si sigue publicado. Caso: una reserva de preventa pagada en efectivo tres días después, o después del show, se acepta si hay lugar.
   - `comprarAccion` no frena por IP ni por email. Caso: 30 llamadas de 10 entradas reservan un show de 300 durante 20 minutos, y se puede repetir. Cada una crea una preferencia en la cuenta de la banda.
5. **Una banda archivada se sigue cobrando y no puede cancelar.**
   - Al archivar no se cancela la suscripción de Mercado Pago, y `/pago` está cerrado en ARCHIVADO.
   - Si Mercado Pago cobra después, el cobro se registra, pero `fijarEstado` no toca una banda archivada (`src/nucleo/cuenta/index.ts:49`).
   - Resultado: hay cobro, sin servicio, sin devolución y sin alerta.
6. **La auditoría se puede borrar desde la app.**
   - `deoco_aislar_tabla` le da `SELECT, INSERT, UPDATE, DELETE` a `deoco_app` (`prisma/migrations/20261014100000_aislar_tabla/migration.sql:21`) y se aplicó a `auditoria` (`20261015100000_admin_auditoria/migration.sql:21`).
   - Para td3 («registro obligatorio») la app tendría que tener solo INSERT y SELECT.
7. **Carrera en la tienda que pierde un pago duplicado.**
   - `buscar` no bloquea el pedido (`modulos/tienda/pagos.ts:43-47`); la ticketera sí lo hace (`compras.ts:159-163`).
   - Caso: llegan juntos dos avisos de dos pagos. El segundo responde «ya-pagado» sin dejar fila en `cobro_duplicado`, y la banda no se entera de que tiene que devolverlo.
8. **Contracargos y devoluciones invisibles.**
   - Un `charged_back` o `refunded` sobre algo ya pagado vuelve «ya-pagado» sin anotar nada (`src/nucleo/pagos/registro.ts:91-93`).
   - El pedido sigue «en producción», la deuda con el proveedor sigue en pie y las entradas siguen valiendo en la puerta.
9. **El dominio principal con problema tira también el subdominio** (DISTINTO 2).
10. **Carrera entre subir y publicar en el sitio** (`modulos/sitio/acciones.ts:58-75` y `contenido.ts:117-133`).
    - El archivo se confirma en una transacción y el enlace al perfil en otra.
    - Si otra persona publica en el medio, `publicar` borra el archivo como «no usado», y la próxima publicación sale con la imagen rota.
11. **Archivos huérfanos en disco.**
    - En `src/nucleo/archivos/index.ts:108-110` la escritura al almacén queda fuera del `try`: si falla una variante WebP, el original queda en disco sin fila.
    - Además los bytes se escriben antes de chequear la cuota.
12. **Cambiar la clave no cierra las otras sesiones, y no hay baja de usuario** (`src/nucleo/auth/index.ts:15-45`, JWT de 30 días).
13. **Lo que el staff cambia en el producto base no llega a los productos** (`modulos/tienda/catalogo.ts:266-302`).
    - Un arte que ya no alcanza la resolución sigue publicado.
    - Una variante que el producto base ya no tiene se sigue vendiendo.
14. **Tokens del fan guardados en claro** (`ticketera/compras.ts:100`, `tienda/pedidos.ts:213`). El registro de cuentas guarda el sha256; esto no.
15. **La baja voluntaria recibe los mails de mora.** Después de `cancelar()`, la cuenta entra en la escalera: mails de mora, solo lectura, suspensión y archivo (`modulos/comercial/cuenta.ts:345-405`).
16. **`DEOCO_LIMITE_ALMACENAMIENTO` no se valida.**
    - Pasa por `BigInt(...)` en `src/app/admin/page.tsx:11`, a nivel del módulo, y en `src/nucleo/archivos/index.ts:39`. El arranque no lo revisa.
    - Con `5GB`, toda subida falla y `/admin` revienta al importarse.
17. **El pool de conexiones es único** (`src/nucleo/db/config.ts:20-28`): la apertura de venta de una banda puede dejar sin conexiones a las demás.
18. **Menores.**
    - Cambiar de proveedor con pedidos pendientes: el fan pagó el envío de A y la orden va a B.
    - La puerta acepta un show pasado o no publicado por URL directa (`modulos/ticketera/panel/puerta.tsx:43-45`).
    - El inicio corta en 8 pendientes.
    - El comentario de `tienda/esquema.prisma:138` dice «envío incluido», y el envío se cobra aparte.

**Ya arreglado en esta vuelta:** los textos de la cuota, que prometían «el sitio sigue online» después de B1.

---

## 6. Conflictos entre lo pedido y el 3.2 (para decidir)

1. **B3 contra Pr.6 / Pr.8.**
   - Lo pedido: «si el proveedor deja de ofrecerlo, los productos existentes siguen andando».
   - El 3.2 ratifica: «se bloquea la venta de nuevas unidades» y «sus productos se despublican».
   - Quedó construido como se pidió.
2. **B4 contra el dinero de la etapa 3.** La propuesta (crédito validado por el proveedor) sigue al 3.2. Lo construido (fiado) no.
3. **Planes.** El 3.2 pide 2 niveles en relación 1/3/7, con complementos y prorrateo. Hoy hay 4 planes, sin prorrateo.
4. **Infraestructura.** El 3.2 pide arrancar gestionada. Se arrancó en un VPS con Easypanel.

## 7. Pendientes que el 3.2 deja abiertos (no son errores)

- Ti.2: el texto del contrato con proveedores.
- Pr.3: la hipótesis del directorio.
- X.7: qué países primero.
- O.P: de quién es la obra.
- Los plazos del crédito: B4, puntos 1 y 2; D.15 y D.19.
- Las medidas de plataforma del organizador: L.8, c2.
