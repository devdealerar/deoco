# Kit de componentes del panel (`@/ui`)

Las pantallas de los módulos importan **solo** de `@/ui`. Cada export envuelve un
componente oficial de Untitled UI (`src/components/`, instalados con
`npx untitledui add ...`) con una interfaz en castellano:

| `@/ui`        | Componente oficial                         |
| ------------- | ------------------------------------------ |
| `Boton`       | `base/buttons/button` (`Button`); con `href`, enlace con forma de botón |
| `Campo`       | `base/input/input` (`Input`)               |
| `AreaTexto`   | `base/textarea/textarea` (`TextArea`)      |
| `Selector`    | `base/select/select-native` (`NativeSelect`) |
| `Casilla`     | `base/checkbox/checkbox` (`Checkbox`)      |
| `Insignia`    | `base/badges/badges` (`Badge`)             |
| `Tabla`       | `application/table/table` (`Table`, `TableCard`); con `orden` y `paginacion`, la base de `application/pagination` |
| `Pestanas`    | `application/tabs` (`Tabs`, `TabList`), cada pestaña es un enlace |
| `Filtros`     | formulario GET de un listado; usa `Boton` y los campos del kit |
| `Formulario`  | usa `Boton`; da el estado "deshabilitado" por contexto a los campos |

Listados largos (`Tabla` + `Filtros`): la página, el orden (`orden`, `dir`) y los filtros
viajan en la URL y la pantalla consulta la base con eso. La tabla nunca ordena ni recorta
filas en el navegador. Ejemplo: `src/app/admin/page.tsx` (bandas, 50 por página).

Propios (sin equivalente oficial que sirva):

- `CampoArchivo`: `FileTrigger` e `InputFile` oficiales no ponen `name` en su
  `<input type="file">`, y el archivo no viajaría en el FormData de la server action.
- `Tarjeta`: Untitled UI no trae un componente de tarjeta (ni en PRO). `imagen`, `junto`
  (insignias al lado del título) y `acciones` (a la derecha) para los encabezados más ricos.
- `Aviso`: franja `info`, `advertencia` o `error`. Las alertas PRO son notificaciones
  descartables que cortan el texto en una línea (`docs/untitled-ui-pro.md`).
- `CampoColor`: selector de color nativo; Untitled UI no trae uno.
- `Copiable`: un valor con botón "Copiar" (el botón es el oficial; el resto, no hay).

Las pantallas no arman a mano lo que el kit ya tiene: `tests/ui-propia.test.ts` busca las
marcas de cada componente (alertas, tarjetas, pestañas, botones, campos y tablas sueltos)
fuera de `src/ui`, salvo el sitio público y las excepciones que lista con su motivo.

`@/ui/servidor` (solo servidor): lectura y validación de formularios para server actions.

Para sumar uno: `NODE_USE_ENV_PROXY=1 npx untitledui@latest add <componente> -y --license "$UNTITLEDUI_LICENSE"`
(en este entorno la CLI necesita `NODE_USE_ENV_PROXY=1` para salir por el proxy; `--license` da acceso
a los PRO, ver `docs/untitled-ui-pro.md`).
