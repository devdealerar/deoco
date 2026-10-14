# Kit de componentes del panel (`@/ui`)

Las pantallas de los módulos importan **solo** de `@/ui`. Cada export envuelve un
componente oficial de Untitled UI (`src/components/`, instalados con
`npx untitledui add ...`) con una interfaz en castellano:

| `@/ui`        | Componente oficial                         |
| ------------- | ------------------------------------------ |
| `Boton`       | `base/buttons/button` (`Button`)           |
| `Campo`       | `base/input/input` (`Input`)               |
| `AreaTexto`   | `base/textarea/textarea` (`TextArea`)      |
| `Selector`    | `base/select/select-native` (`NativeSelect`) |
| `Casilla`     | `base/checkbox/checkbox` (`Checkbox`)      |
| `Insignia`    | `base/badges/badges` (`Badge`)             |
| `Tabla`       | `application/table/table` (`Table`, `TableCard`) |
| `Formulario`  | usa `Boton`; da el estado "deshabilitado" por contexto a los campos |

Propios (sin equivalente oficial que sirva):

- `CampoArchivo`: `FileTrigger` e `InputFile` oficiales no ponen `name` en su
  `<input type="file">`, y el archivo no viajaría en el FormData de la server action.
- `Tarjeta`: la versión gratuita no trae un componente de tarjeta.
- `Aviso`: franja de advertencia o error (las alertas de Untitled UI son PRO).
- `Copiable`: un valor con botón "Copiar" (el botón es el oficial; el resto, no hay).

`@/ui/servidor` (solo servidor): lectura y validación de formularios para server actions.

Para sumar uno: `NODE_USE_ENV_PROXY=1 npx untitledui@latest add <componente> -y --license "$UNTITLEDUI_LICENSE"`
(en este entorno la CLI necesita `NODE_USE_ENV_PROXY=1` para salir por el proxy; `--license` da acceso
a los PRO, ver `docs/untitled-ui-pro.md`).
