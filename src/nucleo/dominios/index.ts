// Dominios propios de una banda: alta, verificación por DNS y principal.
// Corre bajo RLS (conTenant): lo usan el panel de la banda (titular) y el back office.
// El certificado HTTPS NO se emite acá: lo emite Easypanel (Traefik) para cada dominio.
import { resolve4, resolveTxt } from "node:dns/promises";
import { Prisma } from "@/generated/prisma/client";
import { conTenant } from "@/nucleo/db/con-tenant";
import { dominioRaiz } from "@/nucleo/tenant/hosts";

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

export type RegistroDns = { tipo: "A" | "TXT"; nombre: string; valor: string; para: string };

/** Prefijo del registro TXT que prueba que el dominio es de la banda. */
export const PREFIJO_TXT = "_deoco";
const valorTxt = (token: string) => `deoco-verificacion=${token}`;

/**
 * Los registros que la banda tiene que crear, exactos: el A lleva el tráfico al servidor;
 * el TXT prueba que el dominio es suyo (sin él, cualquiera podría quedarse con un dominio
 * ajeno que ya apunta a Deoco).
 */
export function registrosDns(dominio: string, token: string, ip: string): RegistroDns[] {
  return [
    { tipo: "A", nombre: dominio, valor: ip, para: "Lleva el sitio al servidor de Deoco." },
    { tipo: "TXT", nombre: `${PREFIJO_TXT}.${dominio}`, valor: valorTxt(token), para: "Prueba que el dominio es de la banda." },
  ];
}

/** Consultas DNS; las pruebas pasan unas falsas. */
export type ConsultaDns = {
  a(host: string): Promise<string[]>;
  txt(host: string): Promise<string[]>;
};

// Que no exista, que no responda o que el servidor DNS falle: para verificar es lo
// mismo, el registro "todavía no se ve".
const sinResultado = (e: unknown): string[] => {
  if (typeof (e as { code?: unknown }).code === "string") return [];
  throw e;
};

export const dnsDelSistema: ConsultaDns = {
  a: (host) => resolve4(host).catch(sinResultado),
  txt: (host) => resolveTxt(host).then((r) => r.map((partes) => partes.join("")), sinResultado),
};

/**
 * IP a la que tienen que apuntar los dominios propios. `DEOCO_IP_PUBLICA` si está; si no,
 * la de `app.<raiz>` (con el registro comodín en "solo DNS", es la IP del servidor).
 */
export async function ipPublica(dns: ConsultaDns = dnsDelSistema): Promise<string | null> {
  const fija = process.env.DEOCO_IP_PUBLICA?.trim();
  if (fija) return fija;
  const [ip] = await dns.a(`app.${dominioRaiz()}`).catch(() => []);
  return ip ?? null;
}

export type DominioBanda = {
  id: string;
  dominio: string;
  esPrincipal: boolean;
  verificado: boolean;
  dePlataforma: boolean;
  /** Solo los propios sin verificar. */
  registros: RegistroDns[] | null;
};

/** Los dominios de la banda, el principal primero, con los registros a crear si faltan verificar. */
export async function dominiosDeBanda(tenantId: string, dns: ConsultaDns = dnsDelSistema): Promise<DominioBanda[]> {
  const filas = await conTenant(tenantId, (tx) =>
    tx.dominio.findMany({ orderBy: [{ esPrincipal: "desc" }, { verificado: "desc" }, { dominio: "asc" }] }),
  );
  const ip = filas.some((d) => !d.verificado) ? ((await ipPublica(dns)) ?? "IP del servidor (sin configurar)") : "";
  return filas.map((d) => ({
    id: d.id,
    dominio: d.dominio,
    esPrincipal: d.esPrincipal,
    verificado: d.verificado,
    dePlataforma: esDePlataforma(d.dominio),
    registros: d.verificado ? null : registrosDns(d.dominio, d.token, ip),
  }));
}

const auditar = (
  tx: Prisma.TransactionClient,
  usuarioId: string,
  tenantId: string,
  accion: string,
  detalle: Prisma.InputJsonValue,
) => tx.auditoria.create({ data: { usuarioId, tenantId, accion, detalle } });

const esUnico = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Registra un dominio propio, sin verificar: todavía no resuelve. */
export async function agregarDominio(usuarioId: string, tenantId: string, crudo: string): Promise<string> {
  const dominio = normalizarDominio(crudo);
  try {
    return await conTenant(tenantId, async (tx) => {
      const fila = await tx.dominio.create({ data: { tenantId, dominio }, select: { id: true } });
      await auditar(tx, usuarioId, tenantId, "dominio.agregado", { dominio });
      return fila.id;
    });
  } catch (e) {
    if (esUnico(e)) throw new ErrorDominio(`${dominio} ya está registrado en esta banda.`);
    throw e;
  }
}

export type ResultadoVerificacion =
  | { verificado: true }
  | { verificado: false; faltaA: boolean; faltaTxt: boolean; ipEsperada: string | null; ipsEncontradas: string[] };

/**
 * Consulta el DNS y, si los dos registros están, marca el dominio verificado. Desde ese
 * momento resuelve el sitio. Si otra banda lo verificó antes, falla (un dominio, una banda).
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

  const [ipEsperada, ips, txts] = await Promise.all([
    ipPublica(dns),
    dns.a(d.dominio),
    dns.txt(`${PREFIJO_TXT}.${d.dominio}`),
  ]);
  const faltaA = !ipEsperada || !ips.includes(ipEsperada);
  const faltaTxt = !txts.includes(valorTxt(d.token));
  if (faltaA || faltaTxt) return { verificado: false, faltaA, faltaTxt, ipEsperada, ipsEncontradas: ips };

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

/** ¿El dominio abre por HTTPS con un certificado válido? Las pruebas pasan uno falso. */
export type ComprobadorHttps = (dominio: string) => Promise<{ abre: true } | { abre: false; motivo: "certificado" | "sin-respuesta" }>;

// Errores de TLS de Node (undici los deja en `cause.code`).
const ERRORES_CERTIFICADO = /CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY|TLS|SSL|EPROTO/;

/**
 * Pide `https://<dominio>/` sin seguir redirecciones. Cualquier respuesta HTTP sirve: lo
 * que importa es que el certificado sea válido. Con el certificado por defecto de Traefik
 * (dominio todavía no agregado en Easypanel) falla la validación.
 */
export const httpsDelSistema: ComprobadorHttps = async (dominio) => {
  try {
    await fetch(`https://${dominio}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return { abre: true };
  } catch (e) {
    const code = String((e as { cause?: { code?: unknown } }).cause?.code ?? "");
    return { abre: false, motivo: ERRORES_CERTIFICADO.test(code) ? "certificado" : "sin-respuesta" };
  }
};

/**
 * Marca el dominio principal (uno por banda). Un dominio propio tiene que estar verificado
 * y abrir por HTTPS (si no, el subdominio redirigiría a un sitio sin certificado). Los
 * demás dominios de la banda, el subdominio incluido, redirigen a él.
 */
export async function marcarPrincipal(
  usuarioId: string,
  tenantId: string,
  dominioId: string,
  https: ComprobadorHttps = httpsDelSistema,
): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
  if (!d.verificado) throw new ErrorDominio(`${d.dominio} todavía no está verificado.`);
  if (d.esPrincipal) return;
  if (!esDePlataforma(d.dominio)) {
    const r = await https(d.dominio);
    if (!r.abre) {
      throw new ErrorDominio(
        r.motivo === "certificado"
          ? `https://${d.dominio} todavía no tiene certificado: falta que Deoco lo active en el servidor. Probá de nuevo cuando abra con candado.`
          : `https://${d.dominio} no responde. Si recién lo verificaste, falta que Deoco lo active en el servidor (certificado); probá de nuevo en un rato.`,
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

/**
 * Quita un dominio propio. Pide confirmación. El principal no se quita (primero se elige
 * otro); el subdominio de la plataforma, nunca.
 */
export async function quitarDominio(usuarioId: string, tenantId: string, dominioId: string, confirmado: boolean): Promise<void> {
  await conTenant(tenantId, async (tx) => {
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
  });
}
