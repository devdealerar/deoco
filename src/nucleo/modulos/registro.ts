import { type DefinicionRol, FORMA_ROL, ROLES_NUCLEO } from "@/nucleo/acceso/roles";
import { problemaNombreEvento } from "@/nucleo/eventos/nombre";
import type {
  CabeceraPublica,
  DefinicionAviso,
  DefinicionAvisoPlataforma,
  DefinicionConsulta,
  DefinicionLimite,
  DefinicionTareaPeriodica,
  GestionCuenta,
  DefinicionPermiso,
  Evento,
  EntradaNavegacion,
  MarcoPublico,
  Modulo,
  PropsRutaAdmin,
  PropsRutaExterna,
  PropsRutaPanel,
  PropsRutaPublica,
  RutaModulo,
} from "./contrato";

const ID = /^[a-z][a-z0-9-]*$/;
const CLAVE_PERMISO = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const SEGMENTO = /^(\[[a-zA-Z][a-zA-Z0-9]*\]|[a-z0-9][a-z0-9-]*)$/;

// Rutas que son del núcleo y ningún módulo puede ocupar.
const RESERVADAS_PANEL = ["/", "/pago", "/archivos", "/dominios", "/credenciales"]; // home del panel, pago de la cuota, archivos, dominios, secretos
/** Ids que usa el núcleo como "módulo" (p. ej. las credenciales de cobro en `secreto`). */
const ID_RESERVADOS = ["pagos", "nucleo"];
const NOMBRE_CONSULTA = /^[a-z][a-z0-9-]{0,62}$/;
const CLAVE_SECRETO = /^[a-z][a-z0-9_]{0,62}$/;
const RESERVADAS_PUBLICAS = ["/ingresar", "/api", "/b", "/archivos", "/admin", "/avisos", "/clave", "/descargas", "/portal", "/registro"]; // plataforma, archivos y avisos

export type PermisoRegistrado = DefinicionPermiso & { moduloId: string };
export type RutaEncontrada<P> = { moduloId: string; ruta: RutaModulo<P>; params: Record<string, string> };
export type EntradaRegistrada = EntradaNavegacion & { moduloId: string };
export type Suscripto = { moduloId: string; manejador: (e: Evento) => Promise<void> };

export type AvisoEncontrado = { definicion: DefinicionAviso; params: Record<string, string> };
export type AvisoPlataformaEncontrado = { definicion: DefinicionAvisoPlataforma; params: Record<string, string> };

export type Registro = {
  modulos: readonly Modulo[];
  modulo(id: string): Modulo | undefined;
  permiso(clave: string): PermisoRegistrado | undefined;
  rutaPanel(path: string): RutaEncontrada<PropsRutaPanel> | undefined;
  rutaPublica(path: string): RutaEncontrada<PropsRutaPublica> | undefined;
  /** Ruta del back office de ese módulo. */
  rutaAdmin(moduloId: string, path: string): RutaEncontrada<PropsRutaAdmin> | undefined;
  /** Ruta del portal de cuentas externas de ese módulo. */
  rutaExterna(moduloId: string, path: string): RutaEncontrada<PropsRutaExterna> | undefined;
  /** Tablas globales declaradas, con su módulo. */
  tablasGlobales: readonly { moduloId: string; tabla: string }[];
  /** Aviso externo declarado por ese módulo para esa ruta. */
  aviso(moduloId: string, path: string): AvisoEncontrado | undefined;
  navegacion: readonly EntradaRegistrada[];
  /** Módulos que declaran emitir este evento. */
  emisores(nombre: string): readonly string[];
  /** Manejadores suscriptos a este evento, uno por módulo. */
  suscriptos(nombre: string): readonly Suscripto[];
  /** El marco del sitio público, si algún módulo lo aporta (a lo sumo uno). */
  marcoPublico?: { moduloId: string; componente: MarcoPublico };
  /** Elementos de cabecera del sitio público, ordenados por `orden` (y por id, si empatan). */
  cabecerasPublicas: { moduloId: string; componente: CabeceraPublica; orden: number }[];
  /** Metadatos del sitio público, si algún módulo los aporta (a lo sumo uno). */
  metadatosPublicos?: { moduloId: string; fn: NonNullable<Modulo["metadatosPublicos"]> };
  /** Consulta ofrecida con ese id (`<modulo>.<nombre>`). */
  consulta(id: string): { moduloId: string; definicion: DefinicionConsulta } | undefined;
  /** Límites declarados, con su id completo (`<modulo>.<clave>`). */
  limites: readonly { id: string; moduloId: string; definicion: DefinicionLimite }[];
  /** El gestor de cuenta, si algún módulo lo es (a lo sumo uno). */
  gestor?: { moduloId: string; gestion: GestionCuenta };
  /** Aviso de plataforma de ese módulo para esa ruta. */
  avisoPlataforma(moduloId: string, path: string): AvisoPlataformaEncontrado | undefined;
  /** Tareas periódicas de todos los módulos. */
  tareasPeriodicas: readonly { moduloId: string; definicion: DefinicionTareaPeriodica }[];
  /** Roles: los del núcleo (sin módulos) y los que declaran los módulos (con quién los declara). */
  roles: readonly RolRegistrado[];
  rol(clave: string): RolRegistrado | undefined;
};

export type RolRegistrado = DefinicionRol & { moduloIds: string[] };

export class ErrorRegistro extends Error {
  constructor(moduloId: string, detalle: string) {
    super(`Módulo "${moduloId}": ${detalle}`);
    this.name = "ErrorRegistro";
  }
}

function segmentos(ruta: string) {
  return ruta === "/" ? [] : ruta.slice(1).split("/");
}

/** Forma canónica para detectar choques: "/x/[id]" y "/x/[slug]" chocan. */
function canonica(ruta: string) {
  return "/" + segmentos(ruta).map((s) => (s.startsWith("[") ? "[]" : s)).join("/");
}

function validarRuta(m: Modulo, ruta: string, reservadas: string[]) {
  if (!ruta.startsWith("/") || (ruta !== "/" && !segmentos(ruta).every((s) => SEGMENTO.test(s)))) {
    throw new ErrorRegistro(m.id, `ruta inválida "${ruta}"`);
  }
  const primer = "/" + (segmentos(ruta)[0] ?? "");
  if (reservadas.includes(ruta) || (primer !== "/" && reservadas.includes(primer))) {
    throw new ErrorRegistro(m.id, `la ruta "${ruta}" es del núcleo`);
  }
}

function coincide(patron: string, path: string): Record<string, string> | null {
  const p = segmentos(patron);
  const s = segmentos(path);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith("[")) params[p[i].slice(1, -1)] = s[i];
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

function indiceRutas<P>(entradas: { moduloId: string; ruta: RutaModulo<P> }[]) {
  // Las rutas fijas ganan sobre las dinámicas ("/x/nuevo" antes que "/x/[id]").
  const ordenadas = [...entradas].sort(
    (a, b) => (a.ruta.ruta.match(/\[/g)?.length ?? 0) - (b.ruta.ruta.match(/\[/g)?.length ?? 0),
  );
  return (path: string): RutaEncontrada<P> | undefined => {
    for (const e of ordenadas) {
      const params = coincide(e.ruta.ruta, path);
      if (params) return { ...e, params };
    }
  };
}

/**
 * Arma el registro a partir de los módulos descubiertos y valida el contrato.
 * Falla al arrancar si un módulo está mal declarado. Las dependencias NO se
 * validan acá: se validan al prender un módulo para una banda.
 */
export function crearRegistro(modulos: Modulo[]): Registro {
  const porId = new Map<string, Modulo>();
  const permisos = new Map<string, PermisoRegistrado>();
  const panel: { moduloId: string; ruta: RutaModulo<PropsRutaPanel> }[] = [];
  const publicas: { moduloId: string; ruta: RutaModulo<PropsRutaPublica> }[] = [];
  const ocupadasPanel = new Map<string, string>();
  const ocupadasPublicas = new Map<string, string>();
  const navegacion: EntradaRegistrada[] = [];
  const emisores = new Map<string, string[]>();
  const suscriptos = new Map<string, Suscripto[]>();
  let marcoPublico: Registro["marcoPublico"];
  let metadatosPublicos: Registro["metadatosPublicos"];
  const cabecerasPublicas: Registro["cabecerasPublicas"] = [];
  const avisos = new Map<string, (path: string) => RutaEncontrada<unknown> | undefined>();
  const admin = new Map<string, (path: string) => RutaEncontrada<PropsRutaAdmin> | undefined>();
  const externas = new Map<string, (path: string) => RutaEncontrada<PropsRutaExterna> | undefined>();
  const tablasGlobales: { moduloId: string; tabla: string }[] = [];
  const definiciones = new Map<RutaModulo<unknown>, DefinicionAviso>();
  const consultas = new Map<string, { moduloId: string; definicion: DefinicionConsulta }>();
  const limites: Registro["limites"][number][] = [];
  let gestor: Registro["gestor"];
  const avisosPlataforma = new Map<string, (path: string) => RutaEncontrada<unknown> | undefined>();
  const definicionesPlataforma = new Map<RutaModulo<unknown>, DefinicionAvisoPlataforma>();
  const tareasPeriodicas: Registro["tareasPeriodicas"][number][] = [];
  const roles = new Map<string, RolRegistrado>(ROLES_NUCLEO.map((r) => [r.clave, { ...r, moduloIds: [] }]));

  for (const m of modulos) {
    if (!ID.test(m.id)) throw new ErrorRegistro(m.id, "id inválido (minúsculas, números y guiones)");
    if (porId.has(m.id)) throw new ErrorRegistro(m.id, "id repetido");
    if (ID_RESERVADOS.includes(m.id)) throw new ErrorRegistro(m.id, "id reservado por el núcleo");
    if (m.dependencias?.includes(m.id)) throw new ErrorRegistro(m.id, "no puede depender de sí mismo");
    porId.set(m.id, m);

    for (const r of m.roles ?? []) {
      if (!FORMA_ROL.test(r.clave)) throw new ErrorRegistro(m.id, `rol "${r.clave}": MAYÚSCULAS y guiones bajos (2 a 30)`);
      if (ROLES_NUCLEO.some((n) => n.clave === r.clave)) throw new ErrorRegistro(m.id, `rol "${r.clave}": es del núcleo`);
      if (!r.etiqueta.trim()) throw new ErrorRegistro(m.id, `rol "${r.clave}": falta la etiqueta`);
      const previo = roles.get(r.clave);
      // El mismo nombre es el mismo rol (con la etiqueta del primero que lo declara).
      if (previo) previo.moduloIds.push(m.id);
      else roles.set(r.clave, { ...r, moduloIds: [m.id] });
    }

    for (const p of m.permisos) {
      if (!CLAVE_PERMISO.test(p.clave)) {
        throw new ErrorRegistro(m.id, `permiso "${p.clave}": el formato es modulo.recurso.accion`);
      }
      if (p.clave.split(".")[0] !== m.id) {
        throw new ErrorRegistro(m.id, `permiso "${p.clave}": solo puede declarar permisos ${m.id}.*`);
      }
      if (permisos.has(p.clave)) throw new ErrorRegistro(m.id, `permiso "${p.clave}" repetido`);
      if (p.exclusivoTitular && !(p.rolesPorDefecto.length === 1 && p.rolesPorDefecto[0] === "TITULAR")) {
        throw new ErrorRegistro(m.id, `permiso "${p.clave}": exclusivoTitular exige rolesPorDefecto = ["TITULAR"]`);
      }
      permisos.set(p.clave, { ...p, moduloId: m.id });
    }
    const permisoPropio = (clave: string | undefined, donde: string) => {
      if (clave !== undefined && permisos.get(clave)?.moduloId !== m.id) {
        throw new ErrorRegistro(m.id, `${donde}: el permiso "${clave}" no lo declara este módulo`);
      }
    };

    if (m.edicion) {
      if (!m.edicion.permiso) throw new ErrorRegistro(m.id, "edicion: falta el permiso");
      permisoPropio(m.edicion.permiso, "edicion");
      if (!(m.rutasPanel ?? []).some((r) => r.ruta === m.edicion!.ruta)) {
        throw new ErrorRegistro(m.id, `edicion: "${m.edicion.ruta}" no es una ruta de panel del módulo`);
      }
      if (!m.edicion.sinPermiso.trim()) throw new ErrorRegistro(m.id, "edicion: falta el mensaje para quien no tiene el permiso");
    }
    for (const r of m.rutasPanel ?? []) {
      validarRuta(m, r.ruta, RESERVADAS_PANEL);
      permisoPropio(r.permiso, `ruta de panel "${r.ruta}"`);
      if (r.metadatos) throw new ErrorRegistro(m.id, `ruta de panel "${r.ruta}": los metadatos son solo del sitio público`);
      const otro = ocupadasPanel.get(canonica(r.ruta));
      if (otro) throw new ErrorRegistro(m.id, `la ruta de panel "${r.ruta}" ya la declara "${otro}"`);
      ocupadasPanel.set(canonica(r.ruta), m.id);
      panel.push({ moduloId: m.id, ruta: r });
    }
    for (const r of m.rutasPublicas ?? []) {
      validarRuta(m, r.ruta, RESERVADAS_PUBLICAS);
      if (r.permiso) throw new ErrorRegistro(m.id, `ruta pública "${r.ruta}": el sitio público no lleva permisos`);
      const otro = ocupadasPublicas.get(canonica(r.ruta));
      if (otro) throw new ErrorRegistro(m.id, `la ruta pública "${r.ruta}" ya la declara "${otro}"`);
      ocupadasPublicas.set(canonica(r.ruta), m.id);
      publicas.push({ moduloId: m.id, ruta: r });
    }

    const ocupadasAdmin = new Set<string>();
    const deAdmin: { moduloId: string; ruta: RutaModulo<PropsRutaAdmin> }[] = [];
    for (const r of m.rutasAdmin ?? []) {
      validarRuta(m, r.ruta, []);
      if (r.permiso) throw new ErrorRegistro(m.id, `ruta de admin "${r.ruta}": no lleva permiso (es solo del staff)`);
      if (r.metadatos) throw new ErrorRegistro(m.id, `ruta de admin "${r.ruta}": los metadatos son solo del sitio público`);
      if (ocupadasAdmin.has(canonica(r.ruta))) throw new ErrorRegistro(m.id, `ruta de admin "${r.ruta}" repetida`);
      ocupadasAdmin.add(canonica(r.ruta));
      deAdmin.push({ moduloId: m.id, ruta: r });
    }
    if (deAdmin.length) admin.set(m.id, indiceRutas(deAdmin));

    const ocupadasExternas = new Set<string>();
    const deExternas: { moduloId: string; ruta: RutaModulo<PropsRutaExterna> }[] = [];
    for (const r of m.rutasExternas ?? []) {
      validarRuta(m, r.ruta, []);
      if (r.permiso) throw new ErrorRegistro(m.id, `ruta externa "${r.ruta}": no lleva permiso (es de la cuenta externa)`);
      if (r.metadatos) throw new ErrorRegistro(m.id, `ruta externa "${r.ruta}": los metadatos son solo del sitio público`);
      if (ocupadasExternas.has(canonica(r.ruta))) throw new ErrorRegistro(m.id, `ruta externa "${r.ruta}" repetida`);
      ocupadasExternas.add(canonica(r.ruta));
      deExternas.push({ moduloId: m.id, ruta: r });
    }
    if (deExternas.length) externas.set(m.id, indiceRutas(deExternas));
    if (deExternas.length > 0 !== Boolean(m.cuentasExternas)) {
      throw new ErrorRegistro(m.id, "cuentasExternas y rutasExternas van juntas");
    }
    if (m.cuentasExternas && !m.cuentasExternas.etiqueta?.trim()) {
      throw new ErrorRegistro(m.id, "cuentasExternas: falta la etiqueta del portal");
    }

    for (const t of m.tablasGlobales ?? []) {
      if (!t.startsWith(`${m.id.replace(/-/g, "_")}_`)) {
        throw new ErrorRegistro(m.id, `tabla global "${t}": tiene que empezar con "${m.id.replace(/-/g, "_")}_"`);
      }
      if (tablasGlobales.some((g) => g.tabla === t)) throw new ErrorRegistro(m.id, `tabla global "${t}" repetida`);
      tablasGlobales.push({ moduloId: m.id, tabla: t });
    }

    for (const n of m.navegacion ?? []) {
      if (!Number.isFinite(n.orden)) throw new ErrorRegistro(m.id, `navegación "${n.etiqueta}": falta orden`);
      if (n.externa) {
        if (n.publica || n.permiso || n.admin) {
          throw new ErrorRegistro(m.id, `externa "${n.etiqueta}": no es pública ni de admin ni lleva permiso`);
        }
        if (!(m.rutasExternas ?? []).some((r) => r.ruta === n.href)) {
          throw new ErrorRegistro(m.id, `externa "${n.etiqueta}": "${n.href}" no es una ruta externa del módulo`);
        }
      } else if (n.admin) {
        if (n.publica || n.permiso) throw new ErrorRegistro(m.id, `admin "${n.etiqueta}": no es pública ni lleva permiso`);
        if (!(m.rutasAdmin ?? []).some((r) => r.ruta === n.href)) {
          throw new ErrorRegistro(m.id, `admin "${n.etiqueta}": "${n.href}" no es una ruta de admin del módulo`);
        }
      } else if (n.publica) {
        if (n.permiso) throw new ErrorRegistro(m.id, `pestaña "${n.etiqueta}": las públicas no llevan permiso`);
        if (!(m.rutasPublicas ?? []).some((r) => r.ruta === n.href)) {
          throw new ErrorRegistro(m.id, `pestaña "${n.etiqueta}": "${n.href}" no es una ruta pública del módulo`);
        }
      } else {
        permisoPropio(n.permiso, `navegación "${n.etiqueta}"`);
        if (!(m.rutasPanel ?? []).some((r) => r.ruta === n.href)) {
          throw new ErrorRegistro(m.id, `navegación "${n.etiqueta}": "${n.href}" no es una ruta de panel del módulo`);
        }
      }
      navegacion.push({ ...n, moduloId: m.id });
    }

    const rutasAviso = new Set<string>();
    const deAvisos: { moduloId: string; ruta: RutaModulo<unknown> }[] = [];
    for (const a of m.avisos ?? []) {
      validarRuta(m, a.ruta, []);
      if (rutasAviso.has(canonica(a.ruta))) throw new ErrorRegistro(m.id, `aviso "${a.ruta}" repetido`);
      rutasAviso.add(canonica(a.ruta));
      const metodos = a.metodos ?? ["POST"];
      if (metodos.length === 0 || metodos.some((x) => x !== "GET" && x !== "POST")) {
        throw new ErrorRegistro(m.id, `aviso "${a.ruta}": métodos válidos GET y POST`);
      }
      if (typeof a.manejador !== "function") throw new ErrorRegistro(m.id, `aviso "${a.ruta}": falta el manejador`);
      const ruta: RutaModulo<unknown> = { ruta: a.ruta, componente: () => null };
      definiciones.set(ruta, a);
      deAvisos.push({ moduloId: m.id, ruta });
    }
    if (deAvisos.length) avisos.set(m.id, indiceRutas(deAvisos));
    if (m.cobros && !(m.avisos ?? []).some((a) => a.ruta === "/pago/[pasarela]")) {
      throw new ErrorRegistro(m.id, 'cobros: falta el aviso "/pago/[pasarela]" (ahí avisa la pasarela)');
    }

    const clavesSecretos = new Set<string>();
    for (const sec of m.secretos ?? []) {
      if (!CLAVE_SECRETO.test(sec.clave)) {
        throw new ErrorRegistro(m.id, `secreto "${sec.clave}": clave inválida (minúsculas, números y _)`);
      }
      if (clavesSecretos.has(sec.clave)) throw new ErrorRegistro(m.id, `secreto "${sec.clave}" repetido`);
      if (!sec.etiqueta?.trim()) throw new ErrorRegistro(m.id, `secreto "${sec.clave}": falta la etiqueta`);
      clavesSecretos.add(sec.clave);
    }

    for (const c of m.consultas ?? []) {
      if (!NOMBRE_CONSULTA.test(c.nombre)) {
        throw new ErrorRegistro(m.id, `consulta "${c.nombre}": nombre inválido (minúsculas, números y guiones)`);
      }
      if (consultas.has(`${m.id}.${c.nombre}`)) throw new ErrorRegistro(m.id, `consulta "${c.nombre}" repetida`);
      if (typeof c.responder !== "function") throw new ErrorRegistro(m.id, `consulta "${c.nombre}": falta responder`);
      consultas.set(`${m.id}.${c.nombre}`, { moduloId: m.id, definicion: c });
    }

    const clavesLimite = new Set<string>();
    for (const l of m.limites ?? []) {
      if (!NOMBRE_CONSULTA.test(l.clave)) throw new ErrorRegistro(m.id, `límite "${l.clave}": clave inválida (minúsculas, números y guiones)`);
      if (clavesLimite.has(l.clave)) throw new ErrorRegistro(m.id, `límite "${l.clave}" repetido`);
      if (!l.etiqueta?.trim()) throw new ErrorRegistro(m.id, `límite "${l.clave}": falta la etiqueta`);
      if (typeof l.usados !== "function" || typeof l.ajustar !== "function") {
        throw new ErrorRegistro(m.id, `límite "${l.clave}": faltan usados y ajustar`);
      }
      clavesLimite.add(l.clave);
      limites.push({ id: `${m.id}.${l.clave}`, moduloId: m.id, definicion: l });
    }

    if (m.gestionaCuenta) {
      if (gestor) throw new ErrorRegistro(m.id, `gestionaCuenta: ya lo es "${gestor.moduloId}" (solo puede haber uno)`);
      const g = m.gestionaCuenta;
      if (typeof g.alCrearBanda !== "function" || typeof g.pantallaPago !== "function" || typeof g.comoAmpliar !== "function") {
        throw new ErrorRegistro(m.id, "gestionaCuenta: faltan alCrearBanda, pantallaPago o comoAmpliar");
      }
      gestor = { moduloId: m.id, gestion: g };
    }
    if (m.avisosPlataforma?.length && !m.gestionaCuenta) {
      throw new ErrorRegistro(m.id, "avisosPlataforma: solo el gestor de cuenta (gestionaCuenta) recibe avisos sin banda");
    }
    const rutasPlataforma = new Set<string>();
    const dePlataforma: { moduloId: string; ruta: RutaModulo<unknown> }[] = [];
    for (const a of m.avisosPlataforma ?? []) {
      validarRuta(m, a.ruta, []);
      if (rutasPlataforma.has(canonica(a.ruta))) throw new ErrorRegistro(m.id, `aviso de plataforma "${a.ruta}" repetido`);
      rutasPlataforma.add(canonica(a.ruta));
      const metodos = a.metodos ?? ["POST"];
      if (metodos.length === 0 || metodos.some((x) => x !== "GET" && x !== "POST")) {
        throw new ErrorRegistro(m.id, `aviso de plataforma "${a.ruta}": métodos válidos GET y POST`);
      }
      if (typeof a.manejador !== "function") throw new ErrorRegistro(m.id, `aviso de plataforma "${a.ruta}": falta el manejador`);
      const ruta: RutaModulo<unknown> = { ruta: a.ruta, componente: () => null };
      definicionesPlataforma.set(ruta, a);
      dePlataforma.push({ moduloId: m.id, ruta });
    }
    if (dePlataforma.length) avisosPlataforma.set(m.id, indiceRutas(dePlataforma));

    const nombresTarea = new Set<string>();
    for (const t of m.tareasPeriodicas ?? []) {
      if (!NOMBRE_CONSULTA.test(t.nombre)) throw new ErrorRegistro(m.id, `tarea "${t.nombre}": nombre inválido`);
      if (nombresTarea.has(t.nombre)) throw new ErrorRegistro(m.id, `tarea "${t.nombre}" repetida`);
      if (!Number.isFinite(t.cadaSegundos) || t.cadaSegundos < 5) throw new ErrorRegistro(m.id, `tarea "${t.nombre}": cadaSegundos mínimo 5`);
      if (typeof t.correr !== "function") throw new ErrorRegistro(m.id, `tarea "${t.nombre}": falta correr`);
      nombresTarea.add(t.nombre);
      tareasPeriodicas.push({ moduloId: m.id, definicion: t });
    }

    if (m.marcoPublico) {
      if (marcoPublico) {
        throw new ErrorRegistro(m.id, `marcoPublico: ya lo aporta "${marcoPublico.moduloId}" (solo puede haber uno)`);
      }
      marcoPublico = { moduloId: m.id, componente: m.marcoPublico };
    }
    if (m.cabeceraPublica) {
      if (!Number.isFinite(m.cabeceraPublica.orden)) throw new ErrorRegistro(m.id, "cabeceraPublica: falta orden");
      cabecerasPublicas.push({ moduloId: m.id, ...m.cabeceraPublica });
    }
    if (m.metadatosPublicos) {
      if (metadatosPublicos) {
        throw new ErrorRegistro(m.id, `metadatosPublicos: ya los aporta "${metadatosPublicos.moduloId}" (solo puede haber uno)`);
      }
      metadatosPublicos = { moduloId: m.id, fn: m.metadatosPublicos };
    }

    for (const nombre of m.eventosEmite ?? []) {
      const problema = problemaNombreEvento(nombre);
      if (problema) throw new ErrorRegistro(m.id, `eventosEmite: ${problema}`);
      emisores.set(nombre, [...(emisores.get(nombre) ?? []), m.id]);
    }
    for (const { evento, manejador } of m.eventosEscucha ?? []) {
      const problema = problemaNombreEvento(evento);
      if (problema) throw new ErrorRegistro(m.id, `eventosEscucha: ${problema}`);
      const lista = suscriptos.get(evento) ?? [];
      if (lista.some((s) => s.moduloId === m.id)) {
        throw new ErrorRegistro(m.id, `eventosEscucha: se suscribe dos veces a "${evento}"`);
      }
      suscriptos.set(evento, [...lista, { moduloId: m.id, manejador }]);
    }
  }

  // Un permiso solo puede dárselo a roles que existen (del núcleo o de algún módulo del build).
  for (const p of permisos.values()) {
    const falta = p.rolesPorDefecto.find((r) => !roles.has(r));
    if (falta) throw new ErrorRegistro(p.moduloId, `permiso "${p.clave}": el rol "${falta}" no existe (ni del núcleo ni de un módulo)`);
  }

  return {
    roles: [...roles.values()],
    rol: (clave) => roles.get(clave),
    modulos: [...porId.values()],
    modulo: (id) => porId.get(id),
    permiso: (clave) => permisos.get(clave),
    rutaPanel: indiceRutas(panel),
    rutaPublica: indiceRutas(publicas),
    rutaAdmin: (moduloId, path) => admin.get(moduloId)?.(path),
    rutaExterna: (moduloId, path) => externas.get(moduloId)?.(path),
    tablasGlobales,
    aviso: (moduloId, path) => {
      const e = avisos.get(moduloId)?.(path);
      return e && { definicion: definiciones.get(e.ruta)!, params: e.params };
    },
    navegacion: navegacion.sort((a, b) => a.orden - b.orden),
    emisores: (nombre) => emisores.get(nombre) ?? [],
    suscriptos: (nombre) => suscriptos.get(nombre) ?? [],
    marcoPublico,
    metadatosPublicos,
    cabecerasPublicas: cabecerasPublicas.sort((a, b) => a.orden - b.orden || a.moduloId.localeCompare(b.moduloId)),
    consulta: (id) => consultas.get(id),
    limites,
    gestor,
    avisoPlataforma: (moduloId, path) => {
      const e = avisosPlataforma.get(moduloId)?.(path);
      return e && { definicion: definicionesPlataforma.get(e.ruta)!, params: e.params };
    },
    tareasPeriodicas,
  };
}
