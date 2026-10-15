// Vender un dominio (docs/diseno-dominios.md §9, D9): cotizar y mandar a pagar. El cobro es del
// gestor de cuenta (`gestionaCuenta.dominios`), en la cuenta de Deoco; con el pago aprobado, el
// gestor arranca la compra (`dominioPagado`). Acá no se registra nada: primero se cobra.
//
// La disponibilidad se consulta al registrador al cotizar y otra vez justo antes de cobrar. Igual
// alguien lo puede registrar mientras la banda paga: entonces la compra falla sin registrar y el
// pago se devuelve entero (compra.ts → `devolucion` → el gestor devuelve).
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { CobroDeDominios } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { ErrorDominio, normalizarDominio, proveedorDns } from "./index";
import { type Aceptacion, type Contacto, registrador } from "./registrador";
import { graciaHasta } from "./plazos";

export type Cotizacion =
  | { dominio: string; disponible: false }
  /** `precio` null: disponible, pero esa terminación no se vende en Deoco. Centavos. */
  | { dominio: string; disponible: true; precio: number | null; anios: number };

/** Lo que eligió el titular en la pantalla de compra (D10). */
export type PedidoDominio = {
  dominio: string;
  anios: number;
  contacto: Contacto;
  aceptacion: Aceptacion;
  hacerPrincipal: boolean;
};

const NO_HABILITADO = "La compra de dominios todavía no está habilitada en Deoco.";

/** Terminación de un dominio de segundo nivel: "com" de labanda.com, "com.ar" de labanda.com.ar. */
export const terminacion = (dominio: string) => dominio.split(".").slice(1).join(".");

function piezas(reg: Registro) {
  const r = registrador();
  const cobro = reg.gestor?.gestion.dominios;
  if (!r || !proveedorDns() || !cobro) throw new ErrorDominio(NO_HABILITADO);
  return { r, cobro };
}

/** ¿Se puede vender en este servidor? (registrador, Cloudflare y un gestor que cobre). */
export const ventaHabilitada = (reg: Registro = registroGlobal()) => Boolean(registrador() && proveedorDns() && reg.gestor?.gestion.dominios);

async function bandaQueCompra(tenantId: string) {
  return conTenant(tenantId, async (tx) => ({
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true, estado: true } }),
    titular: await titularDeBanda(tx),
  }));
}

async function cotizarCon(cobro: CobroDeDominios, crudo: string, anios: number): Promise<Cotizacion> {
  const dominio = normalizarDominio(crudo);
  if (dominio.startsWith("www.") || dominio.split(".").length < 2) throw new ErrorDominio("Escribí el dominio sin www, p. ej. labanda.com.");
  if (!Number.isInteger(anios) || anios < 1 || anios > 10) throw new ErrorDominio("Entre 1 y 10 años.");
  const d = await registrador()!.disponibilidad(dominio);
  if (!d.disponible) return { dominio, disponible: false };
  // Sin costo del registrador no se vende: no sabríamos si el precio lo cubre.
  const precio = d.costo ? await cobro.precio(terminacion(dominio), anios) : null;
  return { dominio, disponible: true, precio, anios };
}

/** Si está libre y cuánto sale. */
export async function cotizarDominio(tenantId: string, crudo: string, anios = 1, reg: Registro = registroGlobal()): Promise<Cotizacion> {
  const { cobro } = piezas(reg);
  const { banda } = await bandaQueCompra(tenantId);
  if (banda.estado === "ARCHIVADO") throw new ErrorDominio("La banda está archivada: no puede sumar dominios.");
  return cotizarCon(cobro, crudo, anios);
}

/** Etiqueta de un dominio ("labanda"): letras, números y guiones, sin guion en las puntas. */
const ETIQUETA = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Buscar: "labanda" (o "labanda.com") en cada terminación a la venta, con su precio. Si escribió
 * una terminación que no se vende, también aparece (sin precio), para decírselo.
 */
export async function buscarDominios(tenantId: string, texto: string, reg: Registro = registroGlobal()): Promise<Cotizacion[]> {
  const { cobro } = piezas(reg);
  const { banda } = await bandaQueCompra(tenantId);
  if (banda.estado === "ARCHIVADO") throw new ErrorDominio("La banda está archivada: no puede sumar dominios.");
  const limpio = texto.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  const [etiqueta, ...resto] = limpio.split(".");
  if (!ETIQUETA.test(etiqueta ?? "")) throw new ErrorDominio("Escribí el nombre que querés, con letras, números o guiones (p. ej. labanda).");
  const pedida = resto.join(".");
  const tlds = (await cobro.terminaciones()).map((t) => t.tld);
  const todas = pedida && !tlds.includes(pedida) ? [pedida, ...tlds] : pedida ? [pedida, ...tlds.filter((t) => t !== pedida)] : tlds;
  return Promise.all(todas.map((tld) => cotizarCon(cobro, `${etiqueta}.${tld}`, 1)));
}

/** Las condiciones del registrador para ese dominio (hay que aceptarlas todas para comprar). */
export async function condicionesDe(dominio: string) {
  const r = registrador();
  if (!r) throw new ErrorDominio(NO_HABILITADO);
  return r.condiciones(terminacion(normalizarDominio(dominio)));
}

/**
 * Teléfono en el formato del registro (+54.1145678900). Acepta "+54 11 4567-8900" y, sin código
 * de país, lo toma como de Argentina ("011 4567-8900" → +54.1145678900).
 */
export function normalizarTelefono(crudo: string): string {
  const t = crudo.replace(/[\s().-]/g, (c) => (c === "." ? "." : ""));
  if (/^\+\d{1,3}\.\d{4,14}$/.test(t)) return t;
  const solo = t.replace(/\./g, "");
  if (/^\+54\d{6,13}$/.test(solo)) return `+54.${solo.slice(3)}`;
  if (/^0?\d{6,13}$/.test(solo)) return `+54.${solo.replace(/^0/, "")}`;
  throw new ErrorDominio("Teléfono: con código de área, p. ej. 11 4567-8900 (o +54.1145678900).");
}

const CAMPOS: (keyof Contacto)[] = ["nombre", "apellido", "email", "telefono", "direccion", "ciudad", "provincia", "codigoPostal", "pais"];

/**
 * El titular confirmó: se vuelve a mirar que esté libre y el gestor crea el cobro. Devuelve adónde
 * mandarlo a pagar. Nada se registra hasta que el pago esté aprobado.
 */
export async function pagarDominio(tenantId: string, usuarioId: string, p: PedidoDominio, reg: Registro = registroGlobal()) {
  const { cobro } = piezas(reg);
  const { banda, titular } = await bandaQueCompra(tenantId);
  if (banda.estado === "ARCHIVADO") throw new ErrorDominio("La banda está archivada: no puede sumar dominios.");
  if (!titular) throw new ErrorDominio("La banda no tiene titular.");
  const falta = CAMPOS.find((c) => !String(p.contacto[c] ?? "").trim());
  if (falta) throw new ErrorDominio(`Falta un dato del titular del dominio (${falta}).`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.contacto.email)) throw new ErrorDominio("El email del titular del dominio no es válido.");
  if (!/^\+\d{1,3}\.\d{4,14}$/.test(p.contacto.telefono)) throw new ErrorDominio("El teléfono va con el código de país, p. ej. +54.1145678900.");
  if (!/^[A-Z]{2}$/.test(p.contacto.pais)) throw new ErrorDominio("El país va con su código de dos letras, p. ej. AR.");
  // Todas las condiciones del registrador, aceptadas (las vigentes, no las que mandó el formulario).
  const faltan = (await condicionesDe(p.dominio)).filter((x) => !p.aceptacion.claves.includes(x.clave));
  if (faltan.length || !p.aceptacion.claves.length) throw new ErrorDominio("Falta aceptar las condiciones.");
  const c = await cotizarCon(cobro, p.dominio, p.anios);
  if (!c.disponible) throw new ErrorDominio(`${c.dominio} ya no está disponible.`);
  if (c.precio === null) throw new ErrorDominio(`Los dominios .${terminacion(c.dominio)} no se venden en Deoco.`);
  return cobro.cobrar(tenantId, {
    tipo: "alta",
    dominio: c.dominio,
    anios: p.anios,
    clave: `alta:${c.dominio}`,
    datos: {
      contacto: p.contacto,
      aceptacion: { fecha: p.aceptacion.fecha.toISOString(), ip: p.aceptacion.ip, claves: p.aceptacion.claves },
      hacerPrincipal: p.hacerPrincipal,
    },
    usuarioId,
    email: (await usuarioPropio(usuarioId))?.email ?? titular.email,
    vuelta: `${origenPlataforma()}/b/${banda.slug}/dominios/compras`,
  });
}

/**
 * Renovar por un año un dominio comprado en Deoco. Con la banda en cualquier estado (suspendida o
 * archivada también: la cuota no le puede hacer perder el dominio). Vencido, durante la gracia.
 */
export async function pagarRenovacion(tenantId: string, usuarioId: string, crudo: string, reg: Registro = registroGlobal()) {
  const { cobro } = piezas(reg);
  const dominio = normalizarDominio(crudo);
  const { banda, titular, fila } = await conTenant(tenantId, async (tx) => ({
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true } }),
    titular: await titularDeBanda(tx),
    fila: await tx.dominio.findFirst({ where: { dominio, comprado: true } }),
  }));
  if (!fila?.venceEn) throw new ErrorDominio(`${dominio} no es un dominio comprado en Deoco.`);
  if (!titular) throw new ErrorDominio("La banda no tiene titular.");
  if (fila.vencidoEn && Date.now() > graciaHasta(fila.vencidoEn).getTime()) {
    throw new ErrorDominio(`Pasó el plazo para renovar ${dominio} al precio de siempre. Todavía se puede recuperar con un recargo del registrador: escribinos y te lo cotizamos.`);
  }
  const renovando = await conTenant(tenantId, (tx) => tx.dominioCompra.findFirst({ where: { dominio, tipo: "renovacion", estado: { in: ["en-curso", "datos"] } } }));
  if (renovando) throw new ErrorDominio(`La renovación de ${dominio} ya está paga: la estamos haciendo.`);
  if ((await cobro.precio(terminacion(dominio), 1)) === null) throw new ErrorDominio(`Los dominios .${terminacion(dominio)} no se renuevan en Deoco por ahora: escribinos.`);
  return cobro.cobrar(tenantId, {
    tipo: "renovacion",
    dominio,
    anios: 1,
    // Un vencimiento, una renovación: pagar dos veces el mismo año se devuelve.
    clave: `renovacion:${dominio}:${fila.venceEn.toISOString().slice(0, 10)}`,
    datos: {},
    usuarioId,
    email: (await usuarioPropio(usuarioId))?.email ?? titular.email,
    vuelta: `${origenPlataforma()}/b/${banda.slug}/dominios/compras`,
  });
}
