// Contrato de módulos. Es lo único que un módulo importa del núcleo (además de
// conTenant y los helpers de acceso). Un módulo nunca importa código de otro.
import type { ReactNode } from "react";
import type { Prisma } from "@/generated/prisma/client";
import type { AccesoPanel } from "@/nucleo/acceso/panel";
import type { DefinicionRol, Rol } from "@/nucleo/acceso/roles";

export type { DefinicionRol, Rol };

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
 * lo que la cuenta vincula (p. ej. el id de un proveedor). Lecturas: `conCuentaExterna()`.
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
  /**
   * Solo panel: la ruta sigue abierta con la banda SUSPENDIDA o ARCHIVADA mientras esto dé true
   * (la puerta de un show ya vendido: el escaneo no se corta por la cuota). Exige `permiso`: la
   * abre solo para quien lo tenga. El resto del panel queda cerrado igual.
   */
  conBandaCerrada?: (tenantId: string, params: Record<string, string>) => Promise<boolean>;
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
  /** Lo que los módulos prendidos aportan a la cabecera (p. ej. el carrito), en fila; null si nada. */
  cabecera: ReactNode;
  children: ReactNode;
};
export type MarcoPublico = (props: PropsMarcoPublico) => ReactNode | Promise<ReactNode>;

/** Elemento de cabecera del sitio público (p. ej. un carrito). Cada módulo puede aportar uno. */
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
 * Consulta que un módulo ofrece a los demás (p. ej. sus próximas fechas de shows). Otro
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

/**
 * Límite que un módulo hace cumplir (p. ej. "productos publicados"). El valor por banda lo fija
 * el gestor de cuenta (ver `gestionaCuenta`); sin valor, no hay tope. El núcleo no sabe de
 * planes: solo guarda números. El módulo lo exige con `exigirLimite` (`@/nucleo/cuenta`) al
 * crear o publicar, y despublica lo que sobra en `ajustar`.
 */
export type DefinicionLimite = {
  /** Minúsculas, números y guiones: `productos-publicados`. Se nombra `<modulo>.<clave>`. */
  clave: string;
  /** En plural, para el mensaje: "productos publicados". */
  etiqueta: string;
  /** Cuántos usa hoy la banda. */
  usados: (tenantId: string) => Promise<number>;
  /**
   * El tope bajó (la banda bajó de plan): dejar como mucho `maximo`, sacando de circulación lo
   * que sobra en orden inverso (lo último primero). NUNCA borrar. Devuelve cuántos sacó.
   */
  ajustar: (tenantId: string, maximo: number) => Promise<number>;
};

/**
 * Gestor de cuenta: el único módulo que decide estado, módulos prendidos y límites de cada
 * banda (p. ej. según su plan y sus pagos). A lo sumo uno. Usa `@/nucleo/cuenta` con su propio
 * contrato; el núcleo solo le avisa cuándo nace una banda y le presta la pantalla /pago.
 */
export type GestionCuenta = {
  /**
   * Una banda nueva (alta del staff o autogestión). Rápido: corre en la misma operación.
   * `opcion`: lo que eligió la persona entre `opcionesDeAlta` (autogestión). Puede devolver
   * adónde mandarla (p. ej. a la pasarela, a cargar su forma de pago).
   */
  alCrearBanda: (tenantId: string, origen: "staff" | "autogestion", opcion?: string) => Promise<{ redireccion?: string } | void>;
  /** Lo que se elige al crear una banda sola (`valor` vuelve como `opcion`). La primera, por defecto. */
  opcionesDeAlta?: () => Promise<{ valor: string; texto: string; detalle?: string }[]>;
  /**
   * La pantalla `/b/<slug>/pago` (abierta aunque la banda esté SUSPENDIDA, solo para el
   * titular): plan, vencimiento, forma de pago, cambiar de plan, pagar.
   */
  pantallaPago: (props: PropsRutaPanel) => ReactNode | Promise<ReactNode>;
  /**
   * Una línea para quien llegó a un límite: qué hacer para tener más (p. ej. "El plan Premium
   * permite 50."). null si no hay forma.
   */
  comoAmpliar: (tenantId: string, limite: string, necesarios: number) => Promise<string | null>;
  /** Cobrar los dominios que la banda compra en Deoco (sin esto, no se venden). */
  dominios?: CobroDeDominios;
};

/**
 * Lo que una compra o renovación de dominio necesita del gestor: precio, cobro y devolución. El
 * gestor cobra en la cuenta de Deoco y, con el pago APROBADO (consultado a la pasarela), llama a
 * `dominioPagado` / `renovacionPagada` (`@/nucleo/dominios/compra`) con el id del pago. Nunca antes.
 */
export type CobroDeDominios = {
  /** Precio en centavos por `anios` para la terminación ("com"), con la privacidad incluida. null: no se vende. */
  precio: (tld: string, anios: number) => Promise<number | null>;
  /**
   * ¿Se registra con privacidad del WHOIS? (incluida en el precio, siempre activada). false: esa
   * terminación no la permite y los datos del titular quedan públicos; se le dice antes de comprar.
   */
  privacidad: (tld: string) => Promise<boolean>;
  /** Las terminaciones a la venta, con su precio por año (centavos) y si tienen privacidad. Para buscar. */
  terminaciones: () => Promise<{ tld: string; precio: number; privacidad: boolean }[]>;
  /** Los cobros de dominios de la banda de los últimos `dias`, para la pantalla de progreso. */
  cobros: (tenantId: string, dias: number) => Promise<CobroDominioVisible[]>;
  /** Crea el cobro y devuelve adónde mandar al titular a pagar. */
  cobrar: (tenantId: string, pedido: PedidoDeCobroDominio) => Promise<{ redireccion: string; monto: number }>;
  /**
   * La compra no se pudo hacer (sin registrar): devolver ese pago entero. Solo lo anota (rápido,
   * idempotente); la devolución la corre y la reintenta el gestor, y si no sale queda a la vista
   * del staff.
   */
  devolver: (tenantId: string, pagoId: string, motivo: string) => Promise<void>;
};

export type PedidoDeCobroDominio = {
  tipo: "alta" | "renovacion";
  dominio: string;
  anios: number;
  /** Lo mismo no se cobra dos veces: "alta:x.com", "renovacion:x.com:2027-10-15". */
  clave: string;
  /** Lo que la compra necesita después del pago (titular, aceptación, principal). */
  datos: Record<string, unknown>;
  usuarioId: string | null;
  /** Mail de quien paga. */
  email: string;
  /** Adónde vuelve después de pagar (o de no pagar). */
  vuelta: string;
};

/**
 * Un cobro de dominio, como lo ve la banda. `pagoId`: el pago aceptado (el `cobroId` de la compra
 * en el núcleo). `estado`: esperando (no pagó todavía) · pagado · sin-pagar (venció el link) ·
 * devolviendo · devuelto.
 */
export type CobroDominioVisible = {
  id: string;
  tipo: "alta" | "renovacion";
  dominio: string;
  monto: number;
  estado: "esperando" | "pagado" | "sin-pagar" | "devolviendo" | "devuelto";
  pagoId: string | null;
  /** Hubo un pago rechazado (y ninguno aprobado). */
  rechazado: boolean;
  creadoEn: Date;
};

/** Algo que el staff tiene que mirar ya: se muestra arriba de todo el back office. */
export type AlertaAdmin = { texto: string; href: string };

/**
 * Aviso de plataforma: no es de una banda (p. ej. la suscripción de la cuota, que la pasarela
 * de Deoco avisa a una sola URL). Llega a `app.<raiz>/avisos/plataforma/<moduloId><ruta>`; el
 * manejador resuelve la banda del aviso y verifica la firma. Solo el gestor de cuenta.
 */
export type DefinicionAvisoPlataforma = {
  ruta: string;
  metodos?: ("GET" | "POST")[];
  manejador: (aviso: Omit<AvisoEntrante, "tenantId">) => Promise<RespuestaAviso | void>;
};

/**
 * Tarea que corre el barrido (en producción) cada `cadaSegundos` (mínimo el período del
 * barrido). Para lo que vence con el tiempo (una mora, una prueba que termina). Idempotente:
 * si el proceso se reinicia, vuelve a correr.
 */
export type DefinicionTareaPeriodica = {
  nombre: string;
  cadaSegundos: number;
  correr: (ahora: Date) => Promise<void>;
};

export type Modulo = {
  id: string;
  nombre: string;
  permisos: DefinicionPermiso[];
  /**
   * Roles de negocio que trae el módulo (PUERTA, COMERCIAL…), además de los del núcleo
   * (TITULAR, EDITOR, LECTURA). Dos módulos pueden declarar el mismo: es el mismo rol. Un rol
   * cuyos módulos están todos apagados para la banda no da ningún permiso.
   */
  roles?: DefinicionRol[];
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
  /**
   * Elemento en la cabecera del sitio público, junto a las pestañas. Uno por módulo; los de los
   * módulos prendidos van en fila por `orden` (menor primero, como la navegación).
   */
  cabeceraPublica?: { componente: CabeceraPublica; orden: number };
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
   * Cuentas externas: usuarios que no son de una banda sino de algo del módulo (p. ej. un
   * proveedor). `etiqueta`: nombre del portal ("Panel de proveedor"). Exige rutasExternas.
   */
  cuentasExternas?: { etiqueta: string };
  /** Pantallas del portal de cuentas externas, en app.<raiz>/portal/<id><ruta>. */
  rutasExternas?: RutaModulo<PropsRutaExterna>[];
  /**
   * Cobra con la pasarela de la banda (`@/nucleo/pagos`): las credenciales las carga el titular
   * una vez, en Credenciales → Cobros. Exige un aviso en "/pago/[pasarela]".
   */
  cobros?: boolean;
  /**
   * Formularios del panel (`accionesDelPanel`, `@/nucleo/acceso/acciones`): el permiso que
   * exigen, la pantalla del panel que refrescan al guardar y lo que ve quien no tiene el permiso.
   * El registro lo valida al arrancar: el permiso es de este módulo y la ruta, una de las suyas.
   */
  edicion?: { permiso: string; ruta: string; sinPermiso: string; guardado?: string };
  /** Consultas que ofrece a otros módulos (ver DefinicionConsulta). */
  consultas?: DefinicionConsulta[];
  /** Ids de módulos que tienen que estar prendidos para prender este. */
  dependencias?: string[];
  /** Límites que el módulo hace cumplir (ver DefinicionLimite). */
  limites?: DefinicionLimite[];
  /** Gestor de cuenta (a lo sumo un módulo). Ver GestionCuenta. */
  gestionaCuenta?: GestionCuenta;
  /** Avisos que no son de una banda (solo el gestor de cuenta). */
  avisosPlataforma?: DefinicionAvisoPlataforma[];
  /** Tareas que corre el barrido cada tanto. */
  tareasPeriodicas?: DefinicionTareaPeriodica[];
  /** Lo que el staff tiene que mirar ya (p. ej. una devolución que no salió). Rápido: corre en cada página del back office. */
  alertasAdmin?: () => Promise<AlertaAdmin[]>;
};
