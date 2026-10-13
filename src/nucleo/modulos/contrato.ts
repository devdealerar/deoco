// Contrato de módulos. Es lo único que un módulo importa del núcleo (además de
// conTenant y los helpers de acceso). Un módulo nunca importa código de otro.
import type { ReactNode } from "react";
import type { Prisma, Rol } from "@/generated/prisma/client";
import type { AccesoPanel } from "@/nucleo/acceso/panel";

export type { Rol };

/**
 * Permiso con forma `modulo.recurso.accion`.
 * `exclusivoTitular`: solo el titular; ni otro rol ni el staff de Deoco (pasarela
 * de cobro). Exige rolesPorDefecto = ["TITULAR"].
 */
export type DefinicionPermiso = {
  clave: string;
  rolesPorDefecto: Rol[];
  exclusivoTitular?: boolean;
};

export type PropsRutaPanel = {
  tenantId: string;
  /** Slug de la banda, para armar links: `/b/${slug}/...` */
  slug: string;
  acceso: AccesoPanel;
  /** Segmentos dinámicos de la ruta: "/x/[id]" → { id } */
  params: Record<string, string>;
  /** Parámetros de consulta: "?estado=aprobado" → consulta.get("estado"). Repetidos: getAll. */
  consulta: URLSearchParams;
};

/**
 * Ruta del módulo en el back office: `app.<raiz>/admin/m/<id><ruta>`. Solo staff (si no,
 * 404). Lo que escriba va por `conStaff()` (`@/nucleo/acceso/staff`), que lo audita.
 */
export type PropsRutaAdmin = {
  /** El staff que está mirando. */
  usuarioId: string;
  params: Record<string, string>;
  consulta: URLSearchParams;
};

/**
 * Ruta del portal de cuentas externas del módulo: `app.<raiz>/portal/<id><ruta>`. Solo un
 * usuario con cuenta externa en este módulo (la crea el staff); si no, 404. `referencia` es
 * lo que la cuenta vincula (el id del proveedor). Lecturas: `conCuentaExterna()`.
 */
export type PropsRutaExterna = {
  usuarioId: string;
  referencia: string;
  params: Record<string, string>;
  consulta: URLSearchParams;
};

export type PropsRutaPublica = {
  tenantId: string;
  params: Record<string, string>;
  /** Parámetros de consulta (p. ej. la vuelta de una pasarela de pago). */
  consulta: URLSearchParams;
};

/**
 * `ruta` empieza con "/" y admite segmentos dinámicos `[nombre]`.
 * Panel: se monta bajo /b/<slug>. Sitio público: en la raíz del host de la banda.
 */
export type RutaModulo<P> = {
  ruta: string;
  /** Solo panel: permiso necesario para entrar (si falta, alcanza con ser miembro). */
  permiso?: string;
  componente: (props: P) => ReactNode | Promise<ReactNode>;
  /**
   * Solo sitio público: título, descripción e imagen de la página (pestaña del navegador y
   * vista previa al compartir). Lo que falte sale de `metadatosPublicos` y, al final, del
   * nombre de la banda: nunca "Deoco".
   */
  metadatos?: (props: P) => MetadatosPagina | Promise<MetadatosPagina>;
};

/**
 * `titulo` de una página: "Press kit" → "Press kit · <banda>". `imagen`: URL absoluta o
 * ruta del mismo sitio (`urlArchivo(...)` de un archivo público).
 */
export type MetadatosPagina = { titulo?: string; descripcion?: string; imagen?: string };

export type EntradaNavegacion = {
  etiqueta: string;
  /** Relativo a la superficie: /b/<slug> en el panel, la raíz en el sitio público. */
  href: string;
  /** Solo panel. Las pestañas públicas no llevan permiso. */
  permiso?: string;
  /** true: pestaña del sitio público. false/ausente: menú del panel. */
  publica?: boolean;
  /** true: entrada del menú del back office (apunta a una de sus `rutasAdmin`). */
  admin?: boolean;
  /** true: entrada del menú del portal de cuentas externas (apunta a una de sus `rutasExternas`). */
  externa?: boolean;
  /** El núcleo ordena de menor a mayor. */
  orden: number;
};

/**
 * Marco del sitio público: lo que envuelve a TODAS las páginas públicas (cabecera,
 * pestañas, identidad visual), sean del módulo que sea. Lo aporta un solo módulo; si
 * ese módulo está apagado para la banda, el núcleo usa un marco neutro.
 */
export type PropsMarcoPublico = {
  tenantId: string;
  /** Pestañas de los módulos prendidos, ya ordenadas. */
  pestanas: { etiqueta: string; href: string }[];
  /** Ruta pública actual (para marcar la pestaña activa). */
  path: string;
  /** Elemento que un módulo aporta a la cabecera (p. ej. el carrito); null si no hay. */
  cabecera: ReactNode;
  children: ReactNode;
};
export type MarcoPublico = (props: PropsMarcoPublico) => ReactNode | Promise<ReactNode>;

/** Elemento de cabecera del sitio público (el carrito de la tienda). Lo aporta un solo módulo. */
export type PropsCabeceraPublica = { tenantId: string; path: string };
export type CabeceraPublica = (props: PropsCabeceraPublica) => ReactNode | Promise<ReactNode>;

/**
 * Aviso externo (webhook de una pasarela). Llega a
 * `app.<raiz>/avisos/<tenantId>/<moduloId><ruta>`: el núcleo resuelve la banda (tiene que
 * existir, no estar archivada y tener el módulo prendido) y llama al manejador.
 */
export type AvisoEntrante = {
  tenantId: string;
  metodo: "GET" | "POST";
  /** Segmentos dinámicos de la ruta del aviso. */
  params: Record<string, string>;
  consulta: URLSearchParams;
  cabeceras: Headers;
  /** Cuerpo crudo, byte por byte como llegó: para verificar la firma (HMAC) de la pasarela. */
  cuerpo: Uint8Array;
  /** El cuerpo como texto UTF-8. */
  texto(): string;
  /** El cuerpo como JSON; null si no lo es. */
  json(): unknown;
};

/** Sin respuesta → 200 "ok". */
export type RespuestaAviso = { estado?: number; cuerpo?: string | Record<string, unknown> };

/**
 * El manejador TIENE QUE SER RÁPIDO E IDEMPOTENTE: la pasarela reintenta y puede mandar el
 * mismo aviso varias veces. Verifica la firma, y el trabajo pesado lo manda al bus con
 * `emitir(..., { unica: <id externo> })`.
 */
export type DefinicionAviso = {
  /** Empieza con "/", admite `[param]`. */
  ruta: string;
  /** Por defecto solo POST. */
  metodos?: ("GET" | "POST")[];
  manejador: (aviso: AvisoEntrante) => Promise<RespuestaAviso | void>;
};

/** Lo que lleva un evento: cualquier valor que se pueda guardar como JSON. */
export type CargaEvento = Prisma.InputJsonValue;

/** Lo que recibe un manejador. Cada manejador recibe su propia copia del payload. */
export type Evento = {
  id: string;
  nombre: string;
  tenantId: string;
  usuarioId: string | null;
  fecha: Date;
  payload: unknown;
};

/**
 * Credencial que la banda le da al módulo (p. ej. el token de una pasarela). La carga el
 * titular en el panel (pantalla del núcleo); el módulo la lee con `leerSecreto(modulo, …)`
 * pasando SU PROPIO objeto de contrato. Nunca se muestra completa.
 */
export type DefinicionSecreto = {
  /** Minúsculas, números y "_": `access_token`. */
  clave: string;
  /** Lo que ve el titular: "Access token de Mercado Pago". */
  etiqueta: string;
  /** Dónde se consigue, en una línea. */
  ayuda?: string;
};

/**
 * Consulta que un módulo ofrece a los demás (p. ej. la ticketera, sus próximas fechas). Otro
 * módulo la pide por id con `consultar(tenantId, "<id>.<nombre>", params, { vacio })`, sin
 * importar código. Si el módulo que responde está apagado para la banda, no existe o falla,
 * quien pregunta recibe su `vacio`: nunca se rompe.
 *
 * La respuesta tiene que ser un valor JSON (objetos, listas, texto, números, booleanos, null;
 * las fechas, como texto ISO). Su forma es el contrato público del módulo: documentala junto a
 * la declaración, y no la cambies sin avisar a quien la usa.
 */
export type DefinicionConsulta = {
  /** Minúsculas, números y guiones: `proximas-fechas`. Se pide como `<id>.<nombre>`. */
  nombre: string;
  /** Corre con la banda que pregunta; lee con conTenant. Rápida: se corta a los pocos segundos. */
  responder: (tenantId: string, params: Record<string, unknown>) => Promise<unknown>;
};

export type Modulo = {
  id: string;
  nombre: string;
  permisos: DefinicionPermiso[];
  rutasPanel?: RutaModulo<PropsRutaPanel>[];
  rutasPublicas?: RutaModulo<PropsRutaPublica>[];
  /** Pantallas del back office (solo staff), en /admin/m/<id><ruta>. */
  rutasAdmin?: RutaModulo<PropsRutaAdmin>[];
  /**
   * Tablas del módulo que no son de ninguna banda (p. ej. el catálogo base). Sin "tenantId";
   * su migración termina en `SELECT deoco_tabla_global('<tabla>')`: todos leen, solo se
   * escriben dentro de conStaff(). En esquema.prisma, el modelo lleva `/// @global`.
   */
  tablasGlobales?: string[];
  navegacion?: EntradaNavegacion[];
  /** Nombres en pasado: `pedido.pagado`. Solo se puede emitir lo que algún módulo declara acá. */
  eventosEmite?: string[];
  /**
   * Manejadores, uno por evento. Corren después de responder al usuario, en orden de
   * emisión por banda, y solo si el módulo está prendido para la banda del evento.
   * TIENEN QUE SER IDEMPOTENTES: tras un reproceso pueden recibir el mismo evento dos veces.
   */
  eventosEscucha?: { evento: string; manejador: (e: Evento) => Promise<void> }[];
  /** Marco del sitio público (a lo sumo un módulo lo aporta). */
  marcoPublico?: MarcoPublico;
  /** Elemento en la cabecera del sitio público, junto a las pestañas (a lo sumo un módulo). */
  cabeceraPublica?: CabeceraPublica;
  /**
   * Metadatos de todo el sitio público de la banda (a lo sumo un módulo): `titulo` es el
   * nombre con el que se muestra la banda; descripción e imagen, los de cualquier página
   * que no declare los suyos.
   */
  metadatosPublicos?: (tenantId: string) => MetadatosPagina | Promise<MetadatosPagina>;
  /** Avisos externos (webhooks), en `app.<raiz>/avisos/<tenantId>/<id><ruta>`. */
  avisos?: DefinicionAviso[];
  /** Credenciales por banda que necesita (cifradas; solo las carga el titular). */
  secretos?: DefinicionSecreto[];
  /**
   * Cuentas externas: usuarios que no son de una banda sino de algo del módulo (el proveedor
   * de la tienda). `etiqueta`: nombre del portal ("Panel de proveedor"). Exige rutasExternas.
   */
  cuentasExternas?: { etiqueta: string };
  /** Pantallas del portal de cuentas externas, en app.<raiz>/portal/<id><ruta>. */
  rutasExternas?: RutaModulo<PropsRutaExterna>[];
  /** Consultas que ofrece a otros módulos (ver DefinicionConsulta). */
  consultas?: DefinicionConsulta[];
  /** Ids de módulos que tienen que estar prendidos para prender este. */
  dependencias?: string[];
};
