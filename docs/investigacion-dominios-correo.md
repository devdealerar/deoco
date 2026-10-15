# Dominios y correo para las bandas · Investigación

Estado al 15/10/2026. El diseño que sale de acá está en `docs/diseno-dominios.md`.

## Volumen de correo (leído del código de Deoco)

| Mail | Cuándo sale | Por banda y mes |
| --- | --- | --- |
| Compra (al fan) | 1 por pedido pagado de la tienda | 1 × pedidos |
| Orden de producción (al proveedor) | 1 por proveedor del pedido | ≈ 1 × pedidos |
| Despacho (al fan) | 1 por orden despachada | ≈ 1 × pedidos |
| Entradas con QR | 1 por compra de entradas pagada | 1 × compras |
| Mora de la cuota | como mucho 1 por día de inicio de mora | casi 0 |
| Suspensión | al suspenderse el panel | casi 0 |
| Verificación del alta | 1 por registro (una sola vez) | 0 en régimen |

No hay mail de bienvenida en el alta del staff ni aviso de cuota cobrada. Fuente:
`modulos/tienda/correos.ts`, `modulos/ticketera/correos.ts`, `modulos/comercial/correos.ts`,
`src/nucleo/autogestion/index.ts`.

Escenarios (supuestos, no datos):

| Escenario | Pedidos de tienda | Compras de entradas | Mails por banda y mes |
| --- | --- | --- | --- |
| Conservador | 10 | 20 | 50 |
| Activo | 60 | 300 | 480 |

| Bandas | Conservador (mails/mes) | Activo (mails/mes) |
| --- | --- | --- |
| 100 | 5.000 | 48.000 |
| 480 | 24.000 | 230.400 |

A eso se suman los **reenvíos** de lo que reciba cada banda en su dominio (el Email Worker los
manda por Resend), que hoy no se pueden estimar. Un show grande concentra el volumen: 300
compras en pocas horas pesan en el límite por segundo del proveedor, no solo en el total
mensual.

## Fuentes

- Certificado (Cloudflare for SaaS, apex con CNAME no soportado salvo apex proxying):
  <https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/>
- Tope de destinos verificados de Email Routing (200 por cuenta, compartidos entre dominios):
  <https://developers.cloudflare.com/email-service/platform/limits/>
- GoDaddy Domains v2 (registro a nombre de un cliente, transferencia saliente, cambio de titular,
  nameservers): <https://developer.godaddy.com/en/docs/references/rest/domains/v2>

Las tres las verificó el responsable del proyecto. Desde el entorno de desarrollo la red rechaza
(403) developers.cloudflare.com, www.cloudflare.com, resend.com, developer.godaddy.com,
namecheap.com, docs.gandi.net, nic.ar, help.shopify.com, ayuda.tiendanube.com y
www.hostinger.com, así que precios de Resend y la comparación con otras plataformas siguen sin
fuente.
