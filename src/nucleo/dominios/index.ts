// Dominios propios de una banda: alta, verificación, principal y revisión periódica.
// Corre bajo RLS (conTenant): lo usan el panel de la banda (titular) y el back office.
//
// Todo el tráfico de los dominios de banda pasa por Cloudflare (docs/diseno-dominios.md). El
// estado (¿llega a Deoco?, ¿tiene certificado?) es el que informa Cloudflare: la app nunca
// resuelve un registro A ni pide un certificado.
//   - "cname": la banda conserva su DNS y crea un CNAME a customers.<raíz> (custom hostname).
//     Más un TXT con el token de la banda, que prueba que el dominio es suyo: el custom
//     hostname es uno solo por dominio y no distingue bandas.
//   - "zona": la zona es nuestra (dominio delegado o comprado). Activa = los nameservers son
//     los nuestros, que ya prueba que es de quien la pidió. Una zona es de una sola banda. Se
//     agregan dos filas: el dominio y su www (las dos muestran el sitio).
import { resolveTxt } from "node:dns/promises";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { ZONA } from "@/nucleo/fechas";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { destinoCname, ErrorProveedor, ipDelServidor, type ProveedorDns, proveedorDns, type RegistroDns, type Zona } from "./proveedor";

export class ErrorDominio extends Error {}

const DOMINIO = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** `https://LaBanda.com/` → `labanda.com`. Lanza ErrorDominio si no es un dominio propio válido. */
export function normalizarDominio(crudo: string): string {
  const dominio = crudo
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!DOMINIO.test(dominio)) throw new ErrorDominio(`"${crudo}" no es un dominio válido (p. ej. labanda.com).`);
  const raiz = dominioRaiz();
  if (dominio === raiz || dominio.endsWith(`.${raiz}`)) {
    throw new ErrorDominio(`Los subdominios de ${raiz} los asigna la plataforma: acá va un dominio propio de la banda.`);
  }
  return dominio;
}

/** Subdominio que asigna la plataforma (`<x>.<raiz>`): siempre verificado, no se toca. */
export function esDePlataforma(dominio: string): boolean {
  return dominio.endsWith(`.${dominioRaiz()}`);
}


export { destinoCname, ErrorProveedor, proveedorDns, type ProveedorDns, type RegistroDns } from "./proveedor";

/** Prefijo del registro TXT que prueba que el dominio es de la banda. */
export const PREFIJO_TXT = "_deoco";
const valorTxt = (token: string) => `deoco-verificacion=${token}`;

/**
 * Los registros que la banda crea en su DNS para conectar un dominio, exactos: el CNAME lleva
 * el tráfico a Deoco (por Cloudflare); el TXT prueba que el dominio es de esta banda (sin él,
 * cualquiera podría quedarse con un dominio ajeno que ya apunta a Deoco).
 */
export function registrosDns(dominio: string, token: string): RegistroDns[] {
  return [
    { tipo: "CNAME", nombre: dominio, valor: destinoCname(), para: "Lleva el sitio a Deoco." },
    { tipo: "TXT", nombre: `${PREFIJO_TXT}.${dominio}`, valor: valorTxt(token), para: "Prueba que el dominio es de la banda." },
  ];
}

/** Consultas DNS (solo el TXT de la banda); las pruebas pasan unas falsas. */
export type ConsultaDns = { txt(host: string): Promise<string[]> };

// Que no exista, que no responda o que el servidor DNS falle: para verificar es lo
// mismo, el registro "todavía no se ve".
const sinResultado = (e: unknown): string[] => {
  if (typeof (e as { code?: unknown }).code === "string") return [];
  throw e;
};

export const dnsDelSistema: ConsultaDns = {
  txt: (host) => resolveTxt(host).then((r) => r.map((partes) => partes.join("")), sinResultado),
};

const NO_HABILITADO = "Los dominios propios todavía no están habilitados en Deoco. Escribinos y lo vemos.";

function proveedor(): ProveedorDns {
  const p = proveedorDns();
  if (!p) throw new ErrorDominio(NO_HABILITADO);
  return p;
}

// ── Estado según Cloudflare ─────────────────────────────────────────────────────────────────

type Fila = { id: string; dominio: string; via: string | null; proveedorId: string | null };

/** Lo que importa del estado en Cloudflare: ¿llega a Deoco? ¿tiene certificado? */
type Estado = { llega: boolean; certificado: boolean; sinRegistrar?: boolean };

const ACTIVO = "active";

/** El dominio de la zona de una fila delegada: `www.x.com` → `x.com`. */
export const apexDe = (dominio: string) => dominio.replace(/^www\./, "");

/**
 * Pregunta a Cloudflare por el dominio y guarda lo que dijo. Lo que falta del lado de Cloudflare
 * (un custom hostname que no existe o se borró; una zona que no se pudo crear) se crea de nuevo:
 * así se repara solo.
 */
async function consultar(tenantId: string, d: Fila, p: ProveedorDns): Promise<Estado> {
  if (d.via === "zona") {
    let z: Zona | null;
    try {
      z = d.proveedorId ? await p.zona(d.proveedorId) : null;
      if (!z) z = await prepararZona(tenantId, apexDe(d.dominio), p);
    } catch (e) {
      if (e instanceof ErrorProveedor && e.tipo === "sin-registrar") {
        await conTenant(tenantId, (tx) =>
          tx.dominio.updateMany({ where: { via: "zona", dominio: { in: [apexDe(d.dominio), `www.${apexDe(d.dominio)}`] } }, data: { estadoProveedor: "sin-registrar" } }),
        );
        return { llega: false, certificado: false, sinRegistrar: true };
      }
      throw e;
    }
    const zona = z;
    await conTenant(tenantId, (tx) =>
      tx.dominio.updateMany({
        where: { via: "zona", proveedorId: zona.id },
        data: { estadoProveedor: zona.estado, certificado: zona.certificado, nameservers: zona.nameservers },
      }),
    );
    const lista = zona.estado === ACTIVO && zona.certificado === ACTIVO;
    if (lista) await soltarHostnamesViejos(tenantId, zona.id, p);
    return { llega: zona.estado === ACTIVO, certificado: lista };
  }
  const h = (d.proveedorId ? await p.hostname(d.proveedorId) : null) ?? (await p.crearHostname(d.dominio));
  await conTenant(tenantId, (tx) =>
    tx.dominio.update({
      where: { id: d.id },
      data: { via: "cname", proveedorId: h.id, estadoProveedor: h.estado, certificado: h.ssl, validacion: h.validacion },
    }),
  );
  return { llega: h.estado === ACTIVO, certificado: h.estado === ACTIVO && h.ssl === ACTIVO };
}

/** Nombres que ocupa el sitio en una zona delegada: el dominio y su www. */
const nombresDelSitio = (apex: string) => [apex, `www.${apex}`];
const DEL_SITIO = new Set(["A", "AAAA", "CNAME"]);

/**
 * Crea (o retoma) la zona de `apex` en nuestra cuenta con los registros del sitio: el dominio
 * con proxy a la IP del servidor y www como CNAME al dominio. Lo que Cloudflare trajo del DNS
 * anterior queda (el correo, por ejemplo), salvo lo que ocupaba esos dos nombres. Guarda en
 * las filas de la banda la zona, sus nameservers y la lista de lo importado (para revisarla).
 */
async function prepararZona(tenantId: string, apex: string, p: ProveedorDns): Promise<Zona> {
  const ip = ipDelServidor();
  if (!ip) throw new ErrorDominio(NO_HABILITADO);
  const z = await p.crearZona(apex);
  const [{ deOtra }] = await prisma.$queryRaw<{ deOtra: boolean }[]>`SELECT zona_de_otra_banda(${z.id}, ${tenantId}::uuid) AS "deOtra"`;
  if (deOtra) throw new ErrorDominio(`Otra banda de Deoco ya está conectando ${apex}. Si el dominio es tuyo, escribinos.`);
  // Vuelve a delegar una zona de la que se estaba yendo: se queda.
  await conTenant(tenantId, (tx) => tx.zonaSaliente.deleteMany({ where: { zonaId: z.id } }));

  await p.ajustarZona(z.id);
  const [, www] = nombresDelSitio(apex);
  const nuestros = [
    { tipo: "A", nombre: apex, valor: ip, proxy: true },
    { tipo: "CNAME", nombre: www, valor: apex, proxy: true },
  ];
  const igual = (r: { tipo: string; nombre: string; valor: string; proxy: boolean }, n: (typeof nuestros)[number]) =>
    r.tipo === n.tipo && r.nombre === n.nombre && r.valor === n.valor && r.proxy === n.proxy;
  const existentes = await p.registros(z.id);
  for (const r of existentes) {
    if (nombresDelSitio(apex).includes(r.nombre) && DEL_SITIO.has(r.tipo) && !nuestros.some((n) => igual(r, n))) await p.borrarRegistro(z.id, r.id);
  }
  for (const n of nuestros) if (!existentes.some((r) => igual(r, n))) await p.crearRegistro(z.id, n);
  const importados: RegistroDns[] = existentes
    .filter((r) => !(nombresDelSitio(apex).includes(r.nombre) && DEL_SITIO.has(r.tipo)))
    .map((r) => ({ tipo: r.tipo, nombre: r.nombre, valor: r.valor, para: "" }));

  await conTenant(tenantId, async (tx) => {
    await tx.dominio.updateMany({
      where: { via: "zona", dominio: { in: nombresDelSitio(apex) } },
      data: { proveedorId: z.id, estadoProveedor: z.estado, nameservers: z.nameservers },
    });
    // Los conectados por CNAME que se están pasando: siguen con su custom hostname hasta que se active.
    await tx.dominio.updateMany({
      where: { via: "cname", migrandoA: { not: null }, dominio: { in: nombresDelSitio(apex) } },
      data: { migrandoA: z.id, nameservers: z.nameservers },
    });
    await tx.dominio.updateMany({ where: { via: "zona", dominio: apex }, data: { validacion: importados } });
  });
  return z;
}

/**
 * Los custom hostnames de los dominios que pasaron de CNAME a delegado: se borran recién con
 * la zona activa y su certificado listo (hasta ahí, quien todavía resuelve con los nameservers
 * viejos sigue llegando por el CNAME). Salvo que otra banda haya registrado el mismo dominio.
 */
async function soltarHostnamesViejos(tenantId: string, zonaId: string, p: ProveedorDns) {
  const filas = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { proveedorId: zonaId, hostnameViejo: { not: null } } }));
  for (const f of filas) {
    const [{ compartido }] = await prisma.$queryRaw<{ compartido: boolean }[]>`SELECT dominio_compartido(${f.dominio}, ${f.id}::uuid) AS compartido`;
    try {
      if (!compartido) await p.borrarHostname(f.hostnameViejo!);
      await conTenant(tenantId, (tx) => tx.dominio.update({ where: { id: f.id }, data: { hostnameViejo: null } }));
    } catch (e) {
      console.warn(`[dominios] no se pudo borrar el custom hostname viejo de ${f.dominio}:`, e instanceof Error ? e.message : e);
    }
  }
}

/** El problema, como lo lee la banda. */
function textoProblema(via: string | null, e: Estado): string {
  if (!e.llega) {
    return via === "zona" ? "Tu dominio dejó de usar los nameservers de Deoco." : "El CNAME de tu dominio dejó de apuntar a Deoco.";
  }
  return "El certificado HTTPS no está activo.";
}

// ── Lista ───────────────────────────────────────────────────────────────────────────────────

/**
 * - `sin-verificar`: falta que la banda cree los registros (o que Cloudflare los vea).
 * - `certificado`: verificado; Cloudflare todavía emite el certificado. Ya muestra el sitio.
 * - `listo`: verificado y con certificado: puede ser el principal.
 * - `problema`: verificado, pero dos revisiones seguidas no llegó a Deoco o perdió el certificado.
 */
export type EstadoDominio = "plataforma" | "sin-verificar" | "certificado" | "listo" | "problema";

export type DominioBanda = {
  id: string;
  dominio: string;
  esPrincipal: boolean;
  verificado: boolean;
  dePlataforma: boolean;
  via: "cname" | "zona" | null;
  estado: EstadoDominio;
  /** Los registros que conectan el dominio (cname): a crear si falta verificar, a revisar si hay problema. */
  registros: RegistroDns[] | null;
  /** Registros extra que pidió Cloudflare, por si tarda en validar. */
  validacion: RegistroDns[];
  problema: { desde: Date; texto: string } | null;
  /** Delegado, sin verificar: los nameservers a poner y lo que trajimos de su DNS anterior. */
  delegacion: {
    nameservers: string[];
    importados: RegistroDns[];
    sinRegistrar: boolean;
    /** `.ar`: se registra y se delega en NIC Argentina. */
    nicAr: boolean;
    /** La fila de www: se activa con el dominio, no tiene pasos propios. */
    acompanaA: string | null;
    /** Conectado por CNAME pasándose a delegado: sigue andando por CNAME hasta que se active. */
    migrando: boolean;
    /** Si para entonces no cambió los nameservers, el pedido vence y se libera. */
    vence: Date;
  } | null;
  /** Delegado del que la banda se está llevando el DNS (salida.ts). */
  salida: {
    seguirConSitio: boolean;
    /** Si para entonces los nameservers no cambiaron, se da de baja la zona. */
    bajaEn: Date;
    /** Lo que tiene que cargar en su DNS nuevo. */
    registros: RegistroDns[];
    /** La fila de www: la salida se maneja desde el dominio. */
    acompanaA: string | null;
    /** La dirección cuyo reenvío deja de andar al cambiar los nameservers. */
    pierdeRecepcion: string | null;
  } | null;
};

/** Los dominios de la banda, el principal primero. Lee lo guardado: no consulta a Cloudflare. */
export async function dominiosDeBanda(tenantId: string): Promise<DominioBanda[]> {
  const [filas, salidas, correo] = await conTenant(tenantId, (tx) =>
    Promise.all([
      tx.dominio.findMany({ orderBy: [{ esPrincipal: "desc" }, { verificado: "desc" }, { dominio: "asc" }] }),
      tx.zonaSaliente.findMany({ where: { seLlevaElDns: true } }),
      tx.correoDominio.findFirst({ where: { recepcion: "activa" }, select: { local: true, dominio: true } }),
    ]),
  );
  return filas.map((d) => {
    const dePlataforma = esDePlataforma(d.dominio);
    const via = dePlataforma ? null : d.via === "zona" ? "zona" : "cname";
    const problema = d.verificado && d.problemaDesde ? { desde: d.problemaDesde, texto: d.problema ?? "" } : null;
    const estado: EstadoDominio = dePlataforma
      ? "plataforma"
      : !d.verificado
        ? "sin-verificar"
        : problema
          ? "problema"
          : d.estadoProveedor === ACTIVO && d.certificado === ACTIVO
            ? "listo"
            : "certificado";
    return {
      id: d.id,
      dominio: d.dominio,
      esPrincipal: d.esPrincipal,
      verificado: d.verificado,
      dePlataforma,
      via,
      estado,
      registros: via === "cname" && (!d.verificado || problema) ? registrosDns(d.dominio, d.token) : null,
      validacion: via === "cname" && !d.verificado && !d.migrandoA && Array.isArray(d.validacion) ? (d.validacion as RegistroDns[]) : [],
      problema,
      delegacion:
        (via === "zona" && !d.verificado) || (via === "cname" && d.migrandoA)
          ? {
              nameservers: d.nameservers,
              importados: Array.isArray(d.validacion) ? (d.validacion as RegistroDns[]) : [],
              sinRegistrar: d.estadoProveedor === "sin-registrar",
              nicAr: /\.ar$/.test(d.dominio),
              acompanaA: d.dominio.startsWith("www.") ? apexDe(d.dominio) : null,
              migrando: via === "cname",
              vence: venceDelegacion(d.creadoEn),
            }
          : null,
      salida: (() => {
        const s = d.via === "zona" && d.verificado ? salidas.find((x) => x.zonaId === d.proveedorId) : undefined;
        if (!s) return null;
        return {
          seguirConSitio: s.seguirConSitio,
          bajaEn: s.bajaEn,
          registros: Array.isArray(s.registros) ? (s.registros as RegistroDns[]) : [],
          acompanaA: d.dominio === s.dominio ? null : s.dominio,
          pierdeRecepcion: correo && correo.dominio === s.dominio ? `${correo.local}@${correo.dominio}` : null,
        };
      })(),
    };
  });
}

const auditar = (
  tx: Prisma.TransactionClient,
  usuarioId: string,
  tenantId: string,
  accion: string,
  detalle: Prisma.InputJsonValue,
) => tx.auditoria.create({ data: { usuarioId, tenantId, accion, detalle } });

const esUnico = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ── Alta ────────────────────────────────────────────────────────────────────────────────────

/**
 * Registra un dominio propio, sin verificar (todavía no resuelve), y lo prepara en Cloudflare:
 *   - `cname`: crea su custom hostname. La banda crea el CNAME y el TXT.
 *   - `zona` (delegar): agrega el dominio y su www y crea la zona con los registros del sitio.
 *     La banda cambia los nameservers en su registrador (o en nic.ar).
 * Si Cloudflare no responde, el dominio queda igual: "Verificar" (o la revisión) lo reintenta.
 */
export async function agregarDominio(usuarioId: string, tenantId: string, crudo: string, via: "cname" | "zona" = "cname"): Promise<string> {
  const p = proveedor();
  if (via === "zona") return agregarDelegado(usuarioId, tenantId, crudo, p);
  const dominio = normalizarDominio(crudo);
  let id: string;
  try {
    id = await conTenant(tenantId, async (tx) => {
      const fila = await tx.dominio.create({ data: { tenantId, dominio, via: "cname" }, select: { id: true } });
      await auditar(tx, usuarioId, tenantId, "dominio.agregado", { dominio });
      return fila.id;
    });
  } catch (e) {
    if (esUnico(e)) throw new ErrorDominio(`${dominio} ya está registrado en esta banda.`);
    throw e;
  }
  try {
    await consultar(tenantId, { id, dominio, via: "cname", proveedorId: null }, p);
  } catch (e) {
    if (e instanceof ErrorProveedor && e.tipo === "datos") {
      // Cloudflare no lo acepta: no tiene sentido dejarlo en la lista.
      await conTenant(tenantId, (tx) => tx.dominio.delete({ where: { id } }));
      console.warn(`[dominios] Cloudflare rechazó ${dominio}: ${e.message}`);
      throw new ErrorDominio(`No pudimos conectar ${dominio}. Revisá que esté bien escrito; si lo está, escribinos.`);
    }
    console.warn(`[dominios] ${dominio}: el custom hostname queda para "Verificar":`, e instanceof Error ? e.message : e);
  }
  return id;
}

async function agregarDelegado(usuarioId: string, tenantId: string, crudo: string, p: ProveedorDns): Promise<string> {
  if (!ipDelServidor()) throw new ErrorDominio(NO_HABILITADO);
  // Se delega el dominio entero: sin www adelante.
  const apex = apexDe(normalizarDominio(crudo));
  const nombres = nombresDelSitio(apex);
  const id = await conTenant(tenantId, async (tx) => {
    const ya = await tx.dominio.findFirst({ where: { dominio: { in: nombres } }, select: { dominio: true } });
    if (ya) throw new ErrorDominio(`${ya.dominio} ya está registrado en esta banda. Para delegar ${apex}, quitalo antes.`);
    const [fila] = await Promise.all(nombres.map((dominio) => tx.dominio.create({ data: { tenantId, dominio, via: "zona" }, select: { id: true } })));
    await auditar(tx, usuarioId, tenantId, "dominio.agregado", { dominio: apex, via: "zona" });
    return fila.id;
  });
  const deshacer = () => conTenant(tenantId, (tx) => tx.dominio.deleteMany({ where: { via: "zona", dominio: { in: nombres } } }));
  try {
    await prepararZona(tenantId, apex, p);
  } catch (e) {
    if (e instanceof ErrorDominio) {
      await deshacer();
      throw e;
    }
    if (e instanceof ErrorProveedor && e.tipo === "sin-registrar") {
      // Un .com.ar que todavía no registró, por ejemplo: queda, y se reintenta.
      await conTenant(tenantId, (tx) => tx.dominio.updateMany({ where: { via: "zona", dominio: { in: nombres } }, data: { estadoProveedor: "sin-registrar" } }));
      return id;
    }
    if (e instanceof ErrorProveedor && e.tipo === "datos") {
      await deshacer();
      console.warn(`[dominios] Cloudflare rechazó la zona ${apex}: ${e.message}`);
      throw new ErrorDominio(`No pudimos preparar ${apex} para delegarlo. Revisá que esté bien escrito (sin www, p. ej. labanda.com o labanda.com.ar); si lo está, escribinos.`);
    }
    console.warn(`[dominios] ${apex}: la zona queda para "Verificar":`, e instanceof Error ? e.message : e);
  }
  return id;
}

/**
 * La zona se activó (la banda cambió los nameservers): quedan verificadas sus filas de esta
 * banda (el dominio y su www). `usuarioId` null: lo detectó la revisión.
 */
async function verificarZona(tenantId: string, zonaId: string, usuarioId: string | null): Promise<number> {
  // Los que estaban conectados por CNAME pasan a la zona (su custom hostname se borra cuando el
  // certificado de la zona esté listo: soltarHostnamesViejos).
  const migrando = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { via: "cname", migrandoA: zonaId } }));
  for (const m of migrando) {
    await conTenant(tenantId, async (tx) => {
      await tx.dominio.update({
        where: { id: m.id },
        data: { via: "zona", proveedorId: zonaId, hostnameViejo: m.proveedorId, migrandoA: null, validacion: [], estadoProveedor: null, certificado: null },
      });
      await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "dominio.delegado", detalle: { dominio: m.dominio, desde: "cname" } } });
    });
  }
  const filas = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { via: "zona", proveedorId: zonaId, verificado: false } }));
  let verificadas = 0;
  for (const f of filas) {
    try {
      await conTenant(tenantId, async (tx) => {
        await tx.dominio.update({ where: { id: f.id }, data: { verificado: true, verificadoEn: new Date(), problemaDesde: null, problema: null } });
        await tx.auditoria.create({
          data: { usuarioId, tenantId, accion: "dominio.verificado", detalle: usuarioId ? { dominio: f.dominio } : { dominio: f.dominio, por: "revision" } },
        });
      });
      verificadas++;
    } catch (e) {
      if (!esUnico(e)) throw e;
      console.warn(`[dominios] ${f.dominio} ya está verificado por otra banda.`);
    }
  }
  if (verificadas) {
    const apex = apexDe(filas[0].dominio);
    // El mail no frena la verificación: si falla, el dominio igual queda andando.
    await avisarDelegacionLista(tenantId, apex, zonaId).catch((e) => console.error(`[dominios] aviso de ${apex} activo:`, e));
  }
  return verificadas;
}

const fechaLarga = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: ZONA });

/** Mail al titular: la delegación se activó (una vez por zona). */
function avisarDelegacionLista(tenantId: string, apex: string, zonaId: string) {
  return avisarAlTitular(tenantId, {
    clave: `dominio-delegado:${zonaId}`,
    asunto: () => `${apex} ya está conectado a Deoco`,
    parrafos: (banda) => [
      `Cambiaste los nameservers de ${apex} y ya está conectado: el sitio de ${banda} anda en ${apex} y en www.${apex}.`,
      "Cloudflare está terminando el certificado HTTPS (suele tardar unos minutos). Cuando esté, podés elegir el dominio como principal en Dominios: desde ahí, tu subdominio de Deoco redirige a él.",
    ],
    boton: { texto: "Ir a Dominios", ruta: "/dominios" },
  });
}

/** Mail al titular: la delegación vence en un par de días si no cambia los nameservers (una vez). */
function avisarDelegacionPorVencer(tenantId: string, apex: string, creadoEn: Date, nameservers: string[], migrando: boolean) {
  const vence = venceDelegacion(creadoEn);
  const nicAr = /\.ar$/.test(apex);
  return avisarAlTitular(tenantId, {
    clave: `dominio-por-vencer:${apex}:${creadoEn.toISOString()}`,
    asunto: () => `${apex}: falta cambiar los nameservers`,
    parrafos: () => [
      `Pediste conectar ${apex} a Deoco, pero todavía no vemos los nameservers de Deoco en el dominio.`,
      `Si no los cambiás antes del ${fechaLarga(vence)}, el pedido vence: lo liberamos y, para conectarlo, hay que pedirlo de nuevo.${migrando ? ` Mientras tanto, www.${apex} sigue andando como hasta ahora.` : ""}`,
      ...(nameservers.length
        ? [`${nicAr ? "En nic.ar, entrá al dominio, elegí Delegar y pegá" : "Donde registraste el dominio, cambiá los nameservers por"} estos dos: ${nameservers.join(" y ")}.`]
        : [`${apex} todavía no figura registrado: ${nicAr ? "registralo en nic.ar" : "registralo"} y después seguí los pasos de Dominios.`]),
      "El cambio puede tardar unas horas en verse: conviene hacerlo cuanto antes.",
    ],
    boton: { texto: "Ver los pasos en Dominios", ruta: "/dominios" },
  });
}

/** Una delegación que nadie completa (la banda nunca cambió los nameservers) vence a los 14 días. */
export const PLAZO_DELEGACION_DIAS = 14;
/** Desde cuántos días antes de vencer se avisa en el panel. */
export const AVISAR_VENCIMIENTO_DIAS = 2;
const venceDelegacion = (creadoEn: Date) => new Date(creadoEn.getTime() + PLAZO_DELEGACION_DIAS * 86_400_000);

/**
 * Un dominio conectado por CNAME pasa a delegado, sin corte (docs/diseno-dominios.md §3.2):
 * se prepara la zona completa (con lo que tenía su DNS) y se agrega lo que falte (el dominio sin
 * www); el conectado sigue andando por su custom hostname mientras la banda cambia los
 * nameservers. Cuando la zona se activa, pasa a la zona; su custom hostname se borra recién con
 * el certificado de la zona listo.
 */
export async function pasarADelegado(usuarioId: string, tenantId: string, dominioId: string): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
  if (esDePlataforma(d.dominio)) throw new ErrorDominio("El subdominio de Deoco no se delega.");
  if (d.via === "zona") throw new ErrorDominio(`${d.dominio} ya está delegado.`);
  if (d.migrandoA) return;
  const p = proveedor();
  if (!ipDelServidor()) throw new ErrorDominio(NO_HABILITADO);
  const apex = apexDe(d.dominio);
  const nombres = nombresDelSitio(apex);
  const creadas = await conTenant(tenantId, async (tx) => {
    const filas = await tx.dominio.findMany({ where: { dominio: { in: nombres } } });
    const nuevas: string[] = [];
    for (const n of nombres) {
      if (!filas.some((f) => f.dominio === n)) nuevas.push((await tx.dominio.create({ data: { tenantId, dominio: n, via: "zona" }, select: { id: true } })).id);
    }
    await tx.dominio.updateMany({ where: { via: "cname", dominio: { in: nombres } }, data: { migrandoA: "pendiente" } });
    await auditar(tx, usuarioId, tenantId, "dominio.pasando_a_delegado", { dominio: apex });
    return nuevas;
  });
  const deshacer = () =>
    conTenant(tenantId, async (tx) => {
      await tx.dominio.deleteMany({ where: { id: { in: creadas } } });
      await tx.dominio.updateMany({ where: { via: "cname", dominio: { in: nombres } }, data: { migrandoA: null, nameservers: [] } });
    });
  try {
    await prepararZona(tenantId, apex, p);
  } catch (e) {
    if (e instanceof ErrorDominio) {
      await deshacer();
      throw e;
    }
    if (e instanceof ErrorProveedor && e.tipo !== "temporal") {
      await deshacer();
      console.warn(`[dominios] Cloudflare rechazó la zona ${apex}: ${e.message}`);
      throw new ErrorDominio(`No pudimos preparar ${apex} para delegarlo. Escribinos y lo vemos.`);
    }
    // Cloudflare no respondió: queda pedido y la revisión lo reintenta.
    console.warn(`[dominios] ${apex}: la zona queda para la revisión:`, e instanceof Error ? e.message : e);
  }
}

/**
 * La delegación de `apex` venció sin que la banda cambiara los nameservers: se libera (se
 * borran la zona y las filas sin verificar; un conectado por CNAME que se estaba pasando queda
 * como estaba). El dominio queda disponible para otra banda.
 */
async function liberarDelegacion(tenantId: string, apex: string, p: ProveedorDns): Promise<void> {
  const nombres = nombresDelSitio(apex);
  const zonaId = await conTenant(tenantId, async (tx) => {
    const filas = await tx.dominio.findMany({ where: { via: "zona", verificado: false, dominio: { in: nombres } } });
    const zona = filas.find((f) => f.proveedorId)?.proveedorId ?? null;
    await tx.dominio.deleteMany({ where: { id: { in: filas.map((f) => f.id) } } });
    await tx.dominio.updateMany({ where: { via: "cname", dominio: { in: nombres }, migrandoA: { not: null } }, data: { migrandoA: null, nameservers: [] } });
    await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.delegacion_vencida", detalle: { dominio: apex, por: "revision" } } });
    // Si algo de la zona quedó verificado (no debería), la zona sigue.
    const enUso = zona ? await tx.dominio.count({ where: { proveedorId: zona } }) : 0;
    return enUso ? null : zona;
  });
  console.log(`[dominios] ${apex}: la delegación venció sin completarse, se liberó.`);
  if (zonaId) await p.borrarZona(zonaId).catch((e) => console.warn(`[dominios] no se pudo borrar la zona de ${apex}:`, e instanceof Error ? e.message : e));
}

/** Delegaciones de la banda que vencen en los próximos días (para el aviso del panel). */
export async function delegacionesPorVencer(tenantId: string, ahora = new Date()): Promise<{ dominio: string; vence: Date }[]> {
  const desde = new Date(ahora.getTime() - (PLAZO_DELEGACION_DIAS - AVISAR_VENCIMIENTO_DIAS) * 86_400_000);
  const filas = await conTenant(tenantId, (tx) =>
    tx.dominio.findMany({
      where: { via: "zona", verificado: false, creadoEn: { lte: desde }, NOT: { dominio: { startsWith: "www." } } },
      orderBy: { dominio: "asc" },
    }),
  );
  return filas.map((f) => ({ dominio: f.dominio, vence: venceDelegacion(f.creadoEn) }));
}

// ── Verificar ───────────────────────────────────────────────────────────────────────────────

export type ResultadoVerificacion =
  | { verificado: true }
  | { verificado: false; via: "cname"; faltaCname: boolean; faltaTxt: boolean; destino: string; sinRespuesta?: boolean }
  | { verificado: false; via: "zona"; sinRegistrar: boolean; sinRespuesta?: boolean };

/**
 * Pregunta a Cloudflare y al DNS. Con el CNAME funcionando (Cloudflare lo ve: hostname activo)
 * y el TXT de esta banda, queda verificado y desde ese momento resuelve el sitio. Si otra
 * banda lo verificó antes, falla (un dominio, una banda).
 */
export async function verificarDominio(
  usuarioId: string,
  tenantId: string,
  dominioId: string,
  dns: ConsultaDns = dnsDelSistema,
): Promise<ResultadoVerificacion> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
  if (d.verificado) return { verificado: true };
  const p = proveedor();

  const zona = d.via === "zona";
  // "Ya cambié los nameservers": que Cloudflare mire ya (si no, lo hace cada tanto).
  if (zona && d.proveedorId) await p.revisarActivacion(d.proveedorId).catch(() => {});
  const [estado, txts] = await Promise.all([
    consultar(tenantId, d, p).catch((e) => {
      if (!(e instanceof ErrorProveedor)) throw e;
      if (e.tipo === "temporal") return null;
      console.warn(`[dominios] Cloudflare rechazó ${d.dominio}: ${e.message}`);
      throw new ErrorDominio(`No pudimos conectar ${d.dominio}. Revisá que esté bien escrito; si lo está, escribinos.`);
    }),
    zona ? Promise.resolve([] as string[]) : dns.txt(`${PREFIJO_TXT}.${d.dominio}`),
  ]);
  if (zona) {
    if (!estado?.llega) return { verificado: false, via: "zona", sinRegistrar: Boolean(estado?.sinRegistrar), sinRespuesta: !estado };
    const { proveedorId } = await conTenant(tenantId, (tx) => tx.dominio.findUniqueOrThrow({ where: { id: d.id }, select: { proveedorId: true } }));
    await verificarZona(tenantId, proveedorId!, usuarioId);
    const ahora = await conTenant(tenantId, (tx) => tx.dominio.findUniqueOrThrow({ where: { id: d.id }, select: { verificado: true } }));
    if (!ahora.verificado) throw new ErrorDominio(`${d.dominio} ya está verificado por otra banda.`);
    return { verificado: true };
  }
  const faltaCname = !estado?.llega;
  const faltaTxt = !txts.includes(valorTxt(d.token));
  if (faltaCname || faltaTxt) return { verificado: false, via: "cname", faltaCname, faltaTxt, destino: destinoCname(), sinRespuesta: !estado };

  try {
    await conTenant(tenantId, async (tx) => {
      await tx.dominio.update({ where: { id: d.id }, data: { verificado: true, verificadoEn: new Date() } });
      await auditar(tx, usuarioId, tenantId, "dominio.verificado", { dominio: d.dominio });
    });
  } catch (e) {
    if (esUnico(e)) throw new ErrorDominio(`${d.dominio} ya está verificado por otra banda.`);
    throw e;
  }
  return { verificado: true };
}

// ── Principal ───────────────────────────────────────────────────────────────────────────────

/**
 * Marca el dominio principal (uno por banda). Un dominio propio tiene que estar verificado y
 * con el certificado activo según Cloudflare (si no, el subdominio redirigiría a un sitio sin
 * candado). Los demás dominios de la banda, el subdominio incluido, redirigen a él.
 */
export async function marcarPrincipal(usuarioId: string, tenantId: string, dominioId: string): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
  if (!d.verificado) throw new ErrorDominio(`${d.dominio} todavía no está verificado.`);
  if (d.esPrincipal) return;
  if (!esDePlataforma(d.dominio)) {
    let e: Estado;
    try {
      e = await consultar(tenantId, d, proveedor());
    } catch (err) {
      if (err instanceof ErrorProveedor) throw new ErrorDominio("No pudimos consultar el estado del dominio. Probá de nuevo en un rato.");
      throw err;
    }
    if (!e.llega) throw new ErrorDominio(`${textoProblema(d.via, e)} Corregilo y probá de nuevo.`);
    if (!e.certificado) {
      throw new ErrorDominio(
        `El certificado de https://${d.dominio} todavía se está emitiendo (lo hace Cloudflare solo; suele tardar unos minutos). Probá de nuevo en un rato.`,
      );
    }
  }
  await conTenant(tenantId, async (tx) => {
    const actual = await tx.dominio.findFirst({ where: { id: d.id, verificado: true } });
    if (!actual || actual.esPrincipal) return;
    await tx.dominio.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } });
    await tx.dominio.update({ where: { id: d.id }, data: { esPrincipal: true } });
    await auditar(tx, usuarioId, tenantId, "dominio.principal_marcado", { dominio: d.dominio });
  });
}

// ── Quitar ──────────────────────────────────────────────────────────────────────────────────

/**
 * Quita un dominio propio. Pide confirmación. El principal no se quita (primero se elige
 * otro); el subdominio de la plataforma, nunca. Borra su custom hostname en Cloudflare, salvo
 * que otra banda tenga registrado el mismo dominio (lo comparten mientras nadie lo verifique).
 */
export async function quitarDominio(usuarioId: string, tenantId: string, dominioId: string, confirmado: boolean): Promise<void> {
  const quitado = await conTenant(tenantId, async (tx) => {
    const d = await tx.dominio.findFirst({ where: { id: dominioId } });
    if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
    if (esDePlataforma(d.dominio)) throw new ErrorDominio("El subdominio de Deoco no se puede quitar.");
    if (d.esPrincipal) throw new ErrorDominio(`${d.dominio} es el principal: elegí otro como principal antes de quitarlo.`);
    if (!confirmado) {
      throw new ErrorDominio(
        d.verificado
          ? d.via === "zona"
            ? `Para quitar ${d.dominio}, confirmalo: deja de mostrar el sitio. Su DNS sigue en Deoco ${PLAZO_SALIDA_DIAS} días (tu correo, si lo tiene, sigue andando) para que cambies los nameservers.`
            : `Para quitar ${d.dominio}, confirmalo: deja de mostrar el sitio.`
          : `Para quitar ${d.dominio}, confirmalo.`,
      );
    }
    await tx.dominio.delete({ where: { id: d.id } });
    await auditar(tx, usuarioId, tenantId, "dominio.quitado", { dominio: d.dominio, verificado: d.verificado });
    return d;
  });
  if (quitado.via === "zona" && quitado.proveedorId) return soltarZona(tenantId, quitado.proveedorId, apexDe(quitado.dominio), quitado.verificado);
  if (!quitado.proveedorId) return;
  const [{ compartido }] = await prisma.$queryRaw<{ compartido: boolean }[]>`
    SELECT dominio_compartido(${quitado.dominio}, ${quitado.id}::uuid) AS compartido`;
  if (compartido) return;
  // Si Cloudflare no responde, queda un custom hostname suelto: no sirve a nadie (sin fila, no
  // resuelve) y no frena a la banda.
  await proveedorDns()
    ?.borrarHostname(quitado.proveedorId)
    .catch((e) => console.warn(`[dominios] no se pudo borrar el custom hostname de ${quitado.dominio}:`, e instanceof Error ? e.message : e));
}

/** Cuánto sigue andando una zona después de que la banda se va (ver salida.ts). */
export const PLAZO_SALIDA_DIAS = 90;

/**
 * Se quitó una fila delegada. Si no queda ninguna de esa zona en la banda: una zona que nunca se
 * activó se borra ya (nada depende de ella); una activa sigue andando PLAZO_SALIDA_DIAS días (el
 * correo de la banda, por ejemplo) hasta que cambie los nameservers (salida.ts la termina).
 */
async function soltarZona(tenantId: string, zonaId: string, apex: string, activa: boolean): Promise<void> {
  const quedan = await conTenant(tenantId, (tx) => tx.dominio.count({ where: { via: "zona", proveedorId: zonaId } }));
  if (quedan) return;
  if (activa) {
    await conTenant(tenantId, (tx) =>
      tx.zonaSaliente.upsert({
        where: { tenantId_zonaId: { tenantId, zonaId } },
        create: { tenantId, zonaId, dominio: apex, bajaEn: new Date(Date.now() + PLAZO_SALIDA_DIAS * 86_400_000) },
        update: {},
      }),
    );
    return;
  }
  const [{ deOtra }] = await prisma.$queryRaw<{ deOtra: boolean }[]>`SELECT zona_de_otra_banda(${zonaId}, ${tenantId}::uuid) AS "deOtra"`;
  if (!deOtra) await proveedorDns()?.borrarZona(zonaId).catch((e) => console.warn(`[dominios] no se pudo borrar la zona de ${apex}:`, e instanceof Error ? e.message : e));
}

// ── Revisión periódica ──────────────────────────────────────────────────────────────────────

/** Cada cuánto se revisa que un dominio propio verificado siga llegando a Deoco. */
export const REVISAR_DOMINIOS_CADA_MS = 6 * 3600_000;
/** Revisiones seguidas con problema para avisar (una sola puede ser algo pasajero). */
const FALLAS_PARA_AVISAR = 2;

/**
 * Revisión periódica (la corre el barrido): cada dominio propio verificado tiene que seguir
 * llegando a Deoco y con certificado, según Cloudflare. Si dos revisiones seguidas no, queda
 * marcado (`problemaDesde` + `problema`) y la banda lo ve en su panel. NO se despublica ni se le
 * quita la verificación: si la banda lo corrige, la próxima revisión lo desmarca sola.
 * El TXT no se vuelve a pedir: ya probó que el dominio es de la banda, y mucha gente lo borra.
 * Si Cloudflare no responde, ese dominio no cuenta como revisado (se reintenta en la próxima).
 */
export async function revisarDominios(ahora = new Date()): Promise<{ revisados: number; conProblema: number; delegados: number }> {
  const delegados = await revisarDelegaciones(ahora);
  return { ...(await revisarVerificados(ahora)), delegados };
}

/** Cada cuánto se mira si una banda ya cambió los nameservers de un dominio delegado. */
export const REVISAR_DELEGACIONES_CADA_MS = 10 * 60_000;

/**
 * Dominios delegados esperando que la banda cambie los nameservers: cuando Cloudflare ve la
 * zona activa, quedan verificados solos (la banda no tiene que volver a tocar nada). Devuelve
 * cuántas filas quedaron verificadas.
 */
async function revisarDelegaciones(ahora: Date): Promise<number> {
  const p = proveedorDns();
  if (!p) return 0;
  const antes = new Date(ahora.getTime() - REVISAR_DELEGACIONES_CADA_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_zonas_pendientes(${antes}::timestamp) AS b`;
  let verificadas = 0;
  let liberadas = 0;
  for (const { id: tenantId } of bandas) {
    const filas = await conTenant(tenantId, (tx) =>
      tx.dominio.findMany({
        where: { via: "zona", verificado: false, OR: [{ revisadoEn: null }, { revisadoEn: { lt: antes } }] },
        orderBy: { dominio: "asc" },
      }),
    );
    // Una consulta por zona (el dominio y su www comparten la zona).
    const vistas = new Set<string>();
    for (const f of filas) {
      const apex = apexDe(f.dominio);
      if (vistas.has(apex)) continue;
      vistas.add(apex);
      try {
        const e = await consultar(tenantId, f, p);
        await conTenant(tenantId, (tx) =>
          tx.dominio.updateMany({ where: { via: "zona", dominio: { in: nombresDelSitio(apex) } }, data: { revisadoEn: ahora } }),
        );
        if (!e.llega) {
          const creado = new Date(Math.min(...filas.filter((x) => apexDe(x.dominio) === apex).map((x) => x.creadoEn.getTime())));
          const vence = venceDelegacion(creado).getTime();
          if (ahora.getTime() >= vence) {
            await liberarDelegacion(tenantId, apex, p);
            liberadas++;
          } else if (ahora.getTime() >= vence - AVISAR_VENCIMIENTO_DIAS * 86_400_000) {
            const zona = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { dominio: { in: nombresDelSitio(apex) } } }));
            const nameservers = zona.find((x) => x.nameservers.length)?.nameservers ?? [];
            const migrando = zona.some((x) => x.via === "cname" && x.migrandoA);
            await avisarDelegacionPorVencer(tenantId, apex, creado, nameservers, migrando).catch((err) =>
              console.error(`[dominios] aviso de ${apex} por vencer:`, err),
            );
          }
          continue;
        }
        const { proveedorId } = await conTenant(tenantId, (tx) => tx.dominio.findUniqueOrThrow({ where: { id: f.id }, select: { proveedorId: true } }));
        const n = await verificarZona(tenantId, proveedorId!, null);
        if (n) console.log(`[dominios] ${apex}: la banda cambió los nameservers, quedó verificado.`);
        verificadas += n;
      } catch (err) {
        console.warn(`[dominios] no se pudo revisar la delegación de ${apex}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  if (liberadas) console.log(`[dominios] delegaciones vencidas y liberadas: ${liberadas}`);
  return verificadas;
}

async function revisarVerificados(ahora: Date): Promise<{ revisados: number; conProblema: number }> {
  const antes = new Date(ahora.getTime() - REVISAR_DOMINIOS_CADA_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT b AS id FROM bandas_con_dominios_a_revisar(${dominioRaiz()}, ${antes}::timestamp) AS b`;
  const p = proveedorDns();
  if (!p) {
    if (bandas.length) console.warn("[dominios] no se revisan: falta configurar Cloudflare (DEOCO_CLOUDFLARE_TOKEN y DEOCO_CLOUDFLARE_ZONA).");
    return { revisados: 0, conProblema: 0 };
  }
  let revisados = 0;
  let conProblema = 0;
  for (const { id: tenantId } of bandas) {
    const dominios = await conTenant(tenantId, (tx) =>
      tx.dominio.findMany({
        where: { verificado: true, OR: [{ revisadoEn: null }, { revisadoEn: { lt: antes } }] },
      }),
    );
    for (const d of dominios) {
      if (esDePlataforma(d.dominio)) continue;
      let e: Estado;
      try {
        e = await consultar(tenantId, d, p);
      } catch (err) {
        console.warn(`[dominios] no se pudo revisar ${d.dominio}:`, err instanceof Error ? err.message : err);
        continue;
      }
      const bien = e.llega && e.certificado;
      const fallas = bien ? 0 : d.fallasSeguidas + 1;
      const problemaDesde = bien ? null : (d.problemaDesde ?? (fallas >= FALLAS_PARA_AVISAR ? ahora : null));
      const problema = problemaDesde ? textoProblema(d.via, e) : null;
      await conTenant(tenantId, (tx) =>
        tx.dominio.update({ where: { id: d.id }, data: { revisadoEn: ahora, fallasSeguidas: fallas, problemaDesde, problema } }),
      );
      if (problemaDesde && !d.problemaDesde) console.warn(`[dominios] ${d.dominio}: ${problema}`);
      revisados++;
      if (problemaDesde) conProblema++;
    }
  }
  return { revisados, conProblema };
}

/** Dominios propios de la banda con un problema (para el aviso del panel). */
export async function dominiosConProblema(tenantId: string): Promise<{ dominio: string; desde: Date; problema: string }[]> {
  const filas = await conTenant(tenantId, (tx) =>
    tx.dominio.findMany({
      where: { verificado: true, problemaDesde: { not: null } },
      select: { dominio: true, problemaDesde: true, problema: true },
      orderBy: { dominio: "asc" },
    }),
  );
  return filas.map((f) => ({ dominio: f.dominio, desde: f.problemaDesde!, problema: f.problema ?? "" }));
}
