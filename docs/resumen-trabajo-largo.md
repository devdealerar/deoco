# Trabajo largo sin supervisión: resumen

Rama `claudev/bold-mendel-t4qerk`. Un commit por parte, con las pruebas en verde.
Las decisiones que tomé sin preguntar, cada una con su porqué, están en
`docs/decisiones-pendientes.md`. **Revisalas antes que nada.** Lo que resolví con
componentes propios por ser PRO en Untitled UI está en `docs/untitled-ui-pro.md`.

## Qué quedó hecho

| Parte | Qué | Dónde |
| --- | --- | --- |
| A1 | Barrido de pendientes al arrancar y cada 60 s: eventos y correos que quedaron sin salir, correos fallidos (2 reintentos solos), correos colgados. Nada se procesa dos veces (se "toman" en la base). | `src/nucleo/barrido.ts` |
| A2 | Revisión de dominios propios cada 6 h (registro A). Dos fallas seguidas → aviso al titular en todo el panel y marca en Dominios. No despublica. | `src/nucleo/dominios` |
| A3 | Rotación de `DEOCO_CLAVE_SECRETOS`: se lee con la anterior durante la rotación y un script recifra todo (todo o nada). | `scripts/rotar-clave-secretos.mjs`, `docs/despliegue.md` |
| B | Consultas entre módulos por id, sin importar código. Módulo apagado, ausente, con error o lento → vacío. | `src/nucleo/consultas`, guía §6 ter |
| C | Panel del proveedor: órdenes de todas las bandas, detalle sin montos de venta, link de impresión nuevo, despacho con seguimiento (mail al fan), cuenta corriente y "marcar saldado". El staff da el acceso. | núcleo `src/nucleo/acceso/externas.ts` + `src/app/portal`; `modulos/tienda/proveedor.ts`, `modulos/tienda/portal/` |
| D | Cobros pasan al núcleo (la tienda y la ticketera los comparten). Módulo ticketera: shows, tipos con cupo garantizado por la base, compra nominada, mail con QR, página de entradas, puerta (rol PUERTA) y resumen en vivo. El sitio muestra sus fechas por la consulta de B. | `src/nucleo/pagos`, `modulos/ticketera` |
| E | Unitarias, punta a punta, lint, tipos y build en verde. Recorrido en el navegador con capturas. | `docs/capturas/` |

## Pruebas

- Unitarias: 353 en 24 archivos (`npm test`).
- Punta a punta: 74 en 13 archivos (`npm run test:e2e`), con dos nuevos:
  `tienda-proveedor.e2e.ts` y `ticketera.e2e.ts`.
- `npm run lint`, `npm run typecheck` y `next build`: limpios.

## Recorrido en el navegador (capturas en `docs/capturas/`)

Sobre una base nueva con la demo, `next dev` y un Mercado Pago simulado (con un botón
"Pagar" que manda el aviso). El recorrido fue:

1. **Alta de banda.** El staff da de alta "Los Nuevos" (01). La titular entra con la clave
   temporal, la cambia y ve su panel (02).
2. **Cobros.** La titular de Los Satélites carga el token en Credenciales → Cobros (03).
3. **Tienda.** El staff carga el proveedor y el producto base. La banda sube el diseño, arma la
   remera y la publica.
4. **Ticketera.** La banda crea un show con dos tipos de entrada, le pone foto y lo publica (04).
5. **Sitio.** La home muestra la fecha de la ticketera con "Entradas" (05). Está también la
   pestaña Fechas (06).
6. **Compra de entradas, en el celular.** Dos entradas nominadas (07), la pasarela simulada (08)
   y las entradas con su QR (09). También llega el mail con los QR.
7. **Compra en la tienda.** Una remera talle M, pagada (10).
8. **Proveedor.**
   - El staff le da acceso (11).
   - El proveedor cambia la clave y ve sus órdenes (12) y el detalle (13).
   - La despacha con número de seguimiento.
   - En su cuenta corriente (14) marca la deuda como saldada.
   - La banda ve el seguimiento en Pedidos (15).
9. **Puerta, en el celular.** La pantalla de validación (16). La primera vez: PASA (17). La
   segunda: YA ENTRÓ, con la hora (18).
10. **Dominio que dejó de apuntar.** El aviso en el panel y el registro A a corregir (19).

Lo que el recorrido encontró y arreglé: la cabecera del sitio se desbordaba en el celular
(con la pestaña Fechas, peor); ahora las pestañas van en su fila y se desplazan. El rótulo del
registro A en Dominios salía cortado. En desarrollo (http) la puerta no podía generar el id de
intento (`crypto.randomUUID` pide https); ahora usa `getRandomValues`.

## Qué queda abierto

- **Revisar `docs/decisiones-pendientes.md`.** Las más grandes:
  - Toqué el núcleo de forma genérica para el portal del proveedor (cuentas externas) y para
    los cobros, porque un módulo no puede importar código de otro.
  - La puerta no tiene modo sin conexión: sin señal no hay verde.
  - No hay ENTREGADO.
  - Entradas: solo pagas, una compra = un tipo.
- **Actualizar producción.** Si alguna banda ya cargó el token de Mercado Pago en la tienda,
  después del deploy hay que correr `node scripts/mover-credenciales-de-cobro.mjs` una vez (o
  que lo vuelva a cargar).
- **Mercado Pago real.** Sigue sin probar contra la API real: acá la red no llega. Todo se probó
  contra el simulado.
- **Cámara de la puerta.** Probada solo la lógica. Pide https: en producción anda; en desarrollo
  por http, se tipea el código.
- **Pestañas del sitio en el celular.** Ahora se desplazan de costado. Con muchas pestañas
  quizás convenga un menú.
- **Vista previa del sitio en el panel.** Sigue mostrando las fechas cargadas a mano, no las de
  la ticketera.
- **Bandas archivadas** con eventos o correos pendientes: el barrido igual los retoma (no las
  filtra). Es inofensivo, pero se puede filtrar.
