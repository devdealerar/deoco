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
const apexDe = (dominio: string) => dominio.replace(/^www\./, "");

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
    return { llega: zona.estado === ACTIVO, certificado: zona.estado === ACTIVO && zona.certificado === ACTIVO };
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
    await tx.dominio.updateMany({ where: { via: "zona", dominio: apex }, data: { validacion: importados } });
  });
  return z;
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
  } | null;
};

/** Los dominios de la banda, el principal primero. Lee lo guardado: no consulta a Cloudflare. */
export async function dominiosDeBanda(tenantId: string): Promise<DominioBanda[]> {
  const filas = await conTenant(tenantId, (tx) =>
    tx.dominio.findMany({ orderBy: [{ esPrincipal: "desc" }, { verificado: "desc" }, { dominio: "asc" }] }),
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
      validacion: via === "cname" && !d.verificado && Array.isArray(d.validacion) ? (d.validacion as RegistroDns[]) : [],
      problema,
      delegacion:
        via === "zona" && !d.verificado
          ? {
              nameservers: d.nameservers,
              importados: Array.isArray(d.validacion) ? (d.validacion as RegistroDns[]) : [],
              sinRegistrar: d.estadoProveedor === "sin-registrar",
              nicAr: /\.ar$/.test(d.dominio),
              acompanaA: d.dominio.startsWith("www.") ? apexDe(d.dominio) : null,
            }
          : null,
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
  return verificadas;
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
          ? `Para quitar ${d.dominio}, confirmalo: deja de mostrar el sitio.`
          : `Para quitar ${d.dominio}, confirmalo.`,
      );
    }
    await tx.dominio.delete({ where: { id: d.id } });
    await auditar(tx, usuarioId, tenantId, "dominio.quitado", { dominio: d.dominio, verificado: d.verificado });
    return d;
  });
  if (quitado.via === "zona" || !quitado.proveedorId) return; // las zonas se dan de baja con su propio plazo (D6)
  const [{ compartido }] = await prisma.$queryRaw<{ compartido: boolean }[]>`
    SELECT dominio_compartido(${quitado.dominio}, ${quitado.id}::uuid) AS compartido`;
  if (compartido) return;
  // Si Cloudflare no responde, queda un custom hostname suelto: no sirve a nadie (sin fila, no
  // resuelve) y no frena a la banda.
  await proveedorDns()
    ?.borrarHostname(quitado.proveedorId)
    .catch((e) => console.warn(`[dominios] no se pudo borrar el custom hostname de ${quitado.dominio}:`, e instanceof Error ? e.message : e));
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
        if (!e.llega) continue;
        const { proveedorId } = await conTenant(tenantId, (tx) => tx.dominio.findUniqueOrThrow({ where: { id: f.id }, select: { proveedorId: true } }));
        const n = await verificarZona(tenantId, proveedorId!, null);
        if (n) console.log(`[dominios] ${apex}: la banda cambió los nameservers, quedó verificado.`);
        verificadas += n;
      } catch (err) {
        console.warn(`[dominios] no se pudo revisar la delegación de ${apex}:`, err instanceof Error ? err.message : err);
      }
    }
  }
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
