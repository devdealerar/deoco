import { problemaNombreEvento } from "@/nucleo/eventos/nombre";
import type {
  DefinicionPermiso,
  Evento,
  EntradaNavegacion,
  MarcoPublico,
  Modulo,
  PropsRutaPanel,
  PropsRutaPublica,
  RutaModulo,
} from "./contrato";

const ID = /^[a-z][a-z0-9-]*$/;
const CLAVE_PERMISO = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const SEGMENTO = /^(\[[a-zA-Z][a-zA-Z0-9]*\]|[a-z0-9][a-z0-9-]*)$/;

// Rutas que son del núcleo y ningún módulo puede ocupar.
const RESERVADAS_PANEL = ["/", "/pago", "/archivos"]; // home del panel, pago de la cuota, archivos
const RESERVADAS_PUBLICAS = ["/ingresar", "/api", "/b", "/archivos"]; // plataforma y archivos

export type PermisoRegistrado = DefinicionPermiso & { moduloId: string };
export type RutaEncontrada<P> = { moduloId: string; ruta: RutaModulo<P>; params: Record<string, string> };
export type EntradaRegistrada = EntradaNavegacion & { moduloId: string };
export type Suscripto = { moduloId: string; manejador: (e: Evento) => Promise<void> };

export type Registro = {
  modulos: readonly Modulo[];
  modulo(id: string): Modulo | undefined;
  permiso(clave: string): PermisoRegistrado | undefined;
  rutaPanel(path: string): RutaEncontrada<PropsRutaPanel> | undefined;
  rutaPublica(path: string): RutaEncontrada<PropsRutaPublica> | undefined;
  navegacion: readonly EntradaRegistrada[];
  /** Módulos que declaran emitir este evento. */
  emisores(nombre: string): readonly string[];
  /** Manejadores suscriptos a este evento, uno por módulo. */
  suscriptos(nombre: string): readonly Suscripto[];
  /** El marco del sitio público, si algún módulo lo aporta (a lo sumo uno). */
  marcoPublico?: { moduloId: string; componente: MarcoPublico };
};

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

  for (const m of modulos) {
    if (!ID.test(m.id)) throw new ErrorRegistro(m.id, "id inválido (minúsculas, números y guiones)");
    if (porId.has(m.id)) throw new ErrorRegistro(m.id, "id repetido");
    if (m.dependencias?.includes(m.id)) throw new ErrorRegistro(m.id, "no puede depender de sí mismo");
    porId.set(m.id, m);

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

    for (const r of m.rutasPanel ?? []) {
      validarRuta(m, r.ruta, RESERVADAS_PANEL);
      permisoPropio(r.permiso, `ruta de panel "${r.ruta}"`);
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

    for (const n of m.navegacion ?? []) {
      if (!Number.isFinite(n.orden)) throw new ErrorRegistro(m.id, `navegación "${n.etiqueta}": falta orden`);
      if (n.publica) {
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

    if (m.marcoPublico) {
      if (marcoPublico) {
        throw new ErrorRegistro(m.id, `marcoPublico: ya lo aporta "${marcoPublico.moduloId}" (solo puede haber uno)`);
      }
      marcoPublico = { moduloId: m.id, componente: m.marcoPublico };
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

  return {
    modulos: [...porId.values()],
    modulo: (id) => porId.get(id),
    permiso: (clave) => permisos.get(clave),
    rutaPanel: indiceRutas(panel),
    rutaPublica: indiceRutas(publicas),
    navegacion: navegacion.sort((a, b) => a.orden - b.orden),
    emisores: (nombre) => emisores.get(nombre) ?? [],
    suscriptos: (nombre) => suscriptos.get(nombre) ?? [],
    marcoPublico,
  };
}
