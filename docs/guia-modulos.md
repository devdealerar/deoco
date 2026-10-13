# Cómo escribir un módulo de Deoco

Un módulo es una carpeta `modulos/<id>/` que se enchufa al núcleo sin tocarlo.
El ejemplo completo y funcionando es `modulos/prueba/`.

## 1. La forma

```
modulos/<id>/
  index.ts        export default el objeto Modulo (obligatorio)
  *.tsx           páginas de panel y del sitio público
  acciones.ts     server actions ("use server")
```

`index.ts` exporta un objeto que cumple `Modulo` (`src/nucleo/modulos/contrato.ts`):

```ts
import type { Modulo } from "@/nucleo/modulos/contrato";

const tienda: Modulo = {
  id: "tienda",                       // minúsculas, números y guiones
  nombre: "Tienda",
  permisos: [
    { clave: "tienda.producto.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // exclusivoTitular: ni otro rol ni el staff de Deoco. Solo con ["TITULAR"].
    { clave: "tienda.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ],
  rutasPanel: [{ ruta: "/tienda", permiso: "tienda.producto.editar", componente: PanelTienda }],
  rutasPublicas: [{ ruta: "/tienda", componente: Catalogo }, { ruta: "/tienda/[producto]", componente: Ficha }],
  navegacion: [
    { etiqueta: "Tienda", href: "/tienda", permiso: "tienda.producto.editar", orden: 30 },
    { etiqueta: "Tienda", href: "/tienda", publica: true, orden: 30 },
  ],
  eventosEmite: ["pedido.pagado"],
  eventosEscucha: [],
  dependencias: [],
};
export default tienda;
```

No hay que registrarlo en ningún lado: `scripts/descubrir-modulos.mjs` lo encuentra
solo antes de `dev`, `build`, `test` y `typecheck`.

## 2. Reglas que no se rompen

- **Nunca importes código de otro módulo.** Se hablan por eventos o por el contrato.
- **Toda tabla nace con `tenantId` y su política RLS** (copiá el bloque de
  `prisma/migrations/*_rls`). `tests/aislamiento.test.ts` falla si una tabla no la tiene.
- **Toda consulta de datos de banda pasa por `conTenant(tenantId, fn)`.**
- **El núcleo no se toca** para enchufar un módulo. Si hace falta, hay que extender el
  contrato, no nombrar el módulo en `src/nucleo`.

## 3. Permisos

- Formato `<id>.recurso.accion`. Un módulo solo declara permisos con su propio prefijo.
- `rolesPorDefecto` dice qué roles lo traen. El staff de Deoco los pasa todos, salvo los
  `exclusivoTitular`.
- Si el módulo está apagado para la banda, todos sus permisos dan false.
- En páginas y acciones: `exigirPermiso(permiso, volver)`, `puedeEnPedido(permiso, volver)`
  (`src/nucleo/acceso/panel.ts`). Fuera de un pedido: `puede(usuarioId, tenantId, permiso)`.

## 4. Rutas y navegación

- `rutasPanel` se montan en `app.deoco.com/b/<slug><ruta>`. El componente recibe
  `{ tenantId, slug, acceso, params }`. El núcleo ya verificó sesión, membresía,
  módulo prendido y el `permiso` de la ruta.
- `rutasPublicas` se montan en la raíz del sitio de la banda (`labanda.deoco.com<ruta>`).
  El componente recibe `{ tenantId, params }`. Es anónimo: no hay sesión.
- Segmentos dinámicos: `/tienda/[producto]` → `params.producto`. Las rutas fijas ganan.
- Rutas del núcleo, prohibidas: `/` y `/pago` en el panel; `/ingresar`, `/api` y `/b` en el sitio.
- `navegacion`: `publica: true` es una pestaña del sitio; si no, una entrada del menú del
  panel, que se oculta si el usuario no tiene `permiso`. `orden`: menor va primero.
  `href` tiene que ser una ruta declarada por el mismo módulo.

## 5. Eventos

- Nombres `entidad.accion` en pasado: `pedido.pagado`, `entrada.validada`.
- Para emitir, declaralo en `eventosEmite` y llamá
  `emitir(nombre, tenantId, payload, usuarioId?)` (`src/nucleo/eventos/bus.ts`).
  Vuelve enseguida: los suscriptos corren después de responder al usuario.
- **Si el evento acompaña a un dato que guardás, emitilo en la misma transacción**, así
  el dato y el evento se confirman o se pierden juntos:

  ```ts
  await conTenant(tenantId, async (tx) => {
    const pedido = await tx.tiendaPedido.update({ where: { id }, data: { estado: "PAGADO" } });
    await emitir("pedido.pagado", tenantId, { pedidoId: pedido.id }, usuarioId, { tx });
  });
  ```

  Si la transacción se revierte, el evento no existe y nadie lo recibe. La entrega
  arranca recién cuando la transacción se confirma (y, en un pedido, después de responder).
- Para escuchar, `eventosEscucha: [{ evento, manejador }]`, un manejador por evento.
  Corre solo si el módulo está prendido para la banda del evento, en orden de emisión.
- Lo que el usuario ve al instante **no** depende de un evento. Un evento mueve trabajo
  de fondo.

### Los manejadores tienen que ser idempotentes

Un manejador puede recibir **el mismo evento más de una vez**: si falló y el staff lo
reprocesa (`reprocesarEvento`), se le vuelve a entregar, y puede que la primera vez haya
llegado a hacer parte del trabajo. Recibirlo dos veces tiene que dar el mismo resultado
que recibirlo una:

- Usá `evento.id` como clave: "si ya existe una orden de producción para este evento, no
  crees otra" (restricción única sobre el id del evento en tu tabla).
- Preferí "dejar en estado X" a "sumar 1".
- Un error sin atrapar marca el evento como FALLIDO para tu módulo, con el mensaje; no
  afecta a los demás suscriptos ni a quien lo emitió.

## 6. Encendido

- Un módulo nace apagado. Lo prende o apaga el staff (`prenderModulo`, `apagarModulo`
  en `src/nucleo/modulos/encendido.ts`).
- `dependencias`: no se puede prender si falta alguna; no se puede apagar uno que otro
  prendido usa.
- Un archivo `SOLO_DESARROLLO.md` en la carpeta deja el módulo afuera del build de
  producción (como `modulos/prueba`), con cualquier comando de build: lo aplica
  `next.config.ts`.
