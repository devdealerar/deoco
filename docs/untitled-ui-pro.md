# Untitled UI PRO

El plan PRO está comprado (octubre 2026). La clave está en la variable de entorno
`UNTITLEDUI_LICENSE`.

## Cómo autentica el CLI

El CLI **no lee ninguna variable de entorno** (documentación oficial:
https://www.untitledui.com/react/docs/cli.md). Toma la clave de `~/.untitledui/config.json`
(lo escribe `npx untitledui@latest login`, que abre el navegador) o del flag `--license`.
En entornos sin navegador (nube, CI) se pasa la variable por el flag:

```sh
NODE_USE_ENV_PROXY=1 npx untitledui@latest add <componente> -y --license "$UNTITLEDUI_LICENSE"
```

`search` usa `-k "$UNTITLEDUI_LICENSE"` en lugar de `--license`. Verificado bajando
`application/alerts` (PRO).

## Evaluación de los componentes propios contra PRO

Se bajaron y leyeron: `alerts`, `tabs`, `pagination`, `empty-state`, `section-headers`,
`metrics`, `date-picker`, `file-upload-base`, `file-upload-menu`, `image-picker`. No hay un
componente de tarjeta (`card`/`cards` no existen en el catálogo). Resultado: **ningún propio se
reemplaza**.

| Propio | Candidato PRO | Decisión y por qué |
| --- | --- | --- |
| `Aviso` | `application/alerts` (`AlertFloating`, `AlertFullWidth`) | Se queda. Son notificaciones descartables: el texto va en un `<p>` que en escritorio se corta en una línea (`md:truncate`) y `AlertFloating` exige un botón de confirmar. Los avisos del panel son párrafos largos con enlaces adentro. |
| `Tarjeta` | — | Se queda. No hay tarjeta en PRO; `section-headers` es solo el encabezado con borde inferior, no el contenedor. |
| `CampoArchivo` | `file-upload-base`, `file-upload-menu`, `image-picker`, `FileTrigger` | Se queda. Ninguno pone `name` en el `<input type="file">` (`FileTrigger` filtra las props con `filterDOMProps`, que descarta `name`). Además suben archivo por archivo con callbacks, no por el formulario. |
| `Copiable` | — | Se queda. No hay equivalente. |
| `Tabla` | `pagination`, `tabs` | Se usan las dos (octubre 2026). `Tabla` ordena con el `Table` oficial y pagina con la base de `pagination` (`Pagination.Root`, `Item`, flechas con el `Button` oficial), con textos en castellano y cada página como enlace. `Pestanas` usa `tabs`. La consulta va siempre contra la base (back office: bandas, usuarios y eventos fallidos, 50 por página). |
| Pantalla de puerta | `metrics` | Se queda. Las métricas PRO son de tablero (tendencia, variación). La puerta necesita números grandes y botones enormes para un celular en un venue. |

## UI hecha a mano fuera de `@/ui`

Resuelto (octubre 2026): alertas → `Aviso`, tarjetas → `Tarjeta`, pestañas → `Pestanas`,
enlaces con forma de botón → `Boton href`, color → `CampoColor`. `tests/ui-propia.test.ts`
falla si una pantalla vuelve a armar alguno a mano. Quedan como excepción, con su motivo en la
prueba: la pantalla de puerta, el error global (compartido con el sitio público) y `/ingresar`
(todavía sin diseño).
