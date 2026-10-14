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
| `Tabla` | `pagination` | Sin cambio por ahora. El `Table` oficial (el que ya usamos) ya permite ordenar (`allowsSorting`, `onSortChange`). La paginación PRO es de cliente (`onPageChange`). Para el back office que crece hace falta paginar y filtrar en el servidor (hoy bandas y usuarios se traen enteros). Eso es una funcionalidad nueva: falta definirla en la spec. |
| Pantalla de puerta | `metrics` | Se queda. Las métricas PRO son de tablero (tendencia, variación). La puerta necesita números grandes y botones enormes para un celular en un venue. |

## UI hecha a mano fuera de `@/ui` (no son PRO, para ordenar aparte)

- Alertas con clases sueltas en vez de `Aviso`: `modulos/tienda/panel/resumen.tsx` (sin
  pasarela), `pedidos.tsx` (duplicados, a revisar), `comun.tsx` (margen negativo).
- Pestañas a mano: `modulos/tienda/panel/comun.tsx` (`Encabezado`) y el filtro de
  `modulos/tienda/portal/paginas.tsx`. Las `tabs` oficiales son de react-aria y cambiarían la
  navegación por links de Next.
- Tarjetas a mano (mismas clases que `Tarjeta`): `src/app/_dominios/lista.tsx`,
  `modulos/tienda/panel/{comun,disenos}.tsx`, `modulos/tienda/portal/paginas.tsx`.
- Links con forma de botón: `src/app/admin/page.tsx`, `modulos/tienda/panel/resumen.tsx`.
