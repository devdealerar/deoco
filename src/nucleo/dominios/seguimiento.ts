// En qué está cada compra o renovación de la banda (pantalla "Tus compras de dominios", D10). Se
// arma de la base cada vez: la banda puede cerrar la página y volver cuando quiera. Junta lo que
// sabe el gestor (el pago y, si hizo falta, la devolución) con lo que sabe la compra (los pasos).
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { CobroDominioVisible } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import type { Contacto } from "./registrador";

export type EstadoPaso = "hecho" | "en-curso" | "pendiente" | "error";
export type Paso = { nombre: string; estado: EstadoPaso };

export type Seguimiento = {
  /** El id del cobro del gestor, o el de la compra si no hay cobro (compras viejas). */
  id: string;
  tipo: "alta" | "renovacion" | "titular";
  dominio: string;
  monto: number | null;
  creadoEn: Date;
  pasos: Paso[];
  /** En curso: todavía puede cambiar (la pantalla se refresca sola). */
  enCurso: boolean;
  /** Lo que tiene que saber la banda, en una línea. */
  mensaje: string;
  tono: "info" | "exito" | "advertencia" | "error";
  /** Falta un dato del titular (GoDaddy lo rechazó): la compra a corregir y el dato. */
  corregir: { compraId: string; campo: string | null; contacto: Contacto } | null;
};

const DIAS = 60;

const NOMBRES_ALTA = ["Pago", "Registro a tu nombre", "Conectando el sitio", "Certificado", "Listo"];
const NOMBRES_RENOVACION = ["Pago", "Renovación", "Listo"];
const NOMBRES_TITULAR = ["Pedido", "Cambio de titular", "Listo"];

/** Índice del paso de la compra en curso (alta). */
const ETAPA_ALTA: Record<string, number> = { cliente: 1, registrar: 1, zona: 2, nameservers: 2, activacion: 2, principal: 3, listo: 4 };

function pasos(nombres: string[], actual: number, estado: EstadoPaso): Paso[] {
  return nombres.map((nombre, i) => ({ nombre, estado: i < actual ? "hecho" : i === actual ? estado : "pendiente" }));
}

const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

/** Las compras y renovaciones de la banda de los últimos 60 días (y las que siguen abiertas), la más nueva primero. */
export async function seguimientoDeCompras(tenantId: string, reg: Registro = registroGlobal()): Promise<Seguimiento[]> {
  const desde = new Date(Date.now() - DIAS * 86_400_000);
  const [cobros, compras] = await Promise.all([
    reg.gestor?.gestion.dominios?.cobros(tenantId, DIAS) ?? Promise.resolve([] as CobroDominioVisible[]),
    // Los nameservers de un comprado se siguen en su tarjeta (la salida), no acá.
    conTenant(tenantId, (tx) => tx.dominioCompra.findMany({ where: { tipo: { not: "dns" }, OR: [{ creadoEn: { gte: desde } }, { estado: { in: ["en-curso", "datos"] } }] }, orderBy: { creadoEn: "desc" } })),
  ]);
  const porPago = new Map(compras.map((c) => [c.cobroId, c]));
  const usadas = new Set<string>();
  const items: Seguimiento[] = [];

  for (const cobro of cobros) {
    const compra = cobro.pagoId ? porPago.get(cobro.pagoId) : undefined;
    if (compra) usadas.add(compra.id);
    // Un link de pago abandonado (venció o lo rechazaron) de algo que después se pagó por otro cobro: no se muestra.
    if (!cobro.pagoId && cobro.estado !== "esperando" && cobros.some((o) => o !== cobro && o.dominio === cobro.dominio && o.tipo === cobro.tipo && o.pagoId)) continue;
    items.push(armar(cobro, compra));
  }
  for (const compra of compras) if (!usadas.has(compra.id)) items.push(armar(null, compra));
  return items.sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
}

type Compra = Awaited<ReturnType<typeof import("@/nucleo/db/cliente").prisma.dominioCompra.findFirstOrThrow>>;

function armar(cobro: CobroDominioVisible | null, compra: Compra | undefined | null): Seguimiento {
  const tipo = (cobro?.tipo ?? compra?.tipo ?? "alta") as Seguimiento["tipo"];
  const nombres = tipo === "alta" ? NOMBRES_ALTA : tipo === "titular" ? NOMBRES_TITULAR : NOMBRES_RENOVACION;
  const dominio = cobro?.dominio ?? compra!.dominio;
  const base = { id: cobro?.id ?? compra!.id, tipo, dominio, monto: tipo === "titular" ? null : (cobro?.monto ?? compra?.monto ?? null), creadoEn: cobro?.creadoEn ?? compra!.creadoEn, corregir: null };

  // Todavía sin compra: depende del pago.
  if (!compra) {
    const c = cobro!;
    if (c.estado === "esperando") {
      return { ...base, pasos: pasos(nombres, 0, c.rechazado ? "error" : "en-curso"), enCurso: !c.rechazado, tono: c.rechazado ? "error" : "info",
        mensaje: c.rechazado ? "El pago no salió: no se te cobró nada. Podés volver a intentarlo." : "Esperando la confirmación del pago (suele tardar segundos)." };
    }
    if (c.estado === "sin-pagar") {
      return { ...base, pasos: pasos(nombres, 0, "error"), enCurso: false, tono: "info", mensaje: c.rechazado ? "El pago no salió: no se te cobró nada." : "No se completó el pago: no se te cobró nada." };
    }
    if (c.estado === "devolviendo" || c.estado === "devuelto") {
      return { ...base, pasos: pasos(nombres, 1, "error"), enCurso: c.estado === "devolviendo", tono: "advertencia",
        mensaje: c.estado === "devuelto" ? "No se pudo hacer: te devolvimos el pago completo." : "No se pudo hacer: te estamos devolviendo el pago completo." };
    }
    // Pagado, la compra está por arrancar.
    return { ...base, pasos: pasos(nombres, 1, "en-curso"), enCurso: true, tono: "info", mensaje: "Pago recibido. Arrancamos en un momento." };
  }

  const actual = tipo === "alta" ? (ETAPA_ALTA[compra.paso] ?? 1) : compra.paso === "listo" ? 2 : 1;
  if (tipo === "titular") {
    const t = compra.contacto as unknown as Contacto;
    if (compra.estado === "listo") return { ...base, pasos: pasos(nombres, nombres.length, "hecho"), enCurso: false, tono: "exito", mensaje: `${dominio} ahora está a nombre de ${t.nombre} ${t.apellido}.` };
    if (compra.estado === "fallido") return { ...base, pasos: pasos(nombres, 1, "error"), enCurso: false, tono: "error", mensaje: `No se pudo cambiar el titular de ${dominio}: sigue como estaba.` };
    if (compra.estado !== "datos") return { ...base, pasos: pasos(nombres, 1, "en-curso"), enCurso: true, tono: compra.motivo ? "advertencia" : "info", mensaje: `Estamos cambiando el titular de ${dominio}. El registrador puede pedir que se confirme por mail.` };
  }
  if (compra.estado === "listo") {
    return {
      ...base,
      pasos: pasos(nombres, nombres.length, "hecho"),
      enCurso: false,
      tono: "exito",
      mensaje:
        tipo === "alta"
          ? `${dominio} ya es tuyo${compra.venceEn ? ` (vence el ${fecha(compra.venceEn)})` : ""}.`
          : `Renovado${compra.venceEn ? `: ahora vence el ${fecha(compra.venceEn)}` : ""}.`,
    };
  }
  if (compra.estado === "fallido") {
    const devuelto = cobro?.estado === "devuelto";
    const devolviendo = compra.devolucion !== null && !devuelto;
    const quien = compra.motivo === "no-disponible" ? `Alguien registró ${dominio} antes que nosotros.` : `No pudimos ${tipo === "alta" ? "registrar" : "renovar"} ${dominio}.`;
    return {
      ...base,
      pasos: pasos(nombres, actual, "error"),
      enCurso: devolviendo,
      tono: "error",
      mensaje: compra.devolucion
        ? `${quien} ${devuelto ? "Te devolvimos el pago completo." : "Te estamos devolviendo el pago completo."}`
        : `${quien} Ya es tuyo: lo seguimos intentando con el equipo de Deoco.`,
    };
  }
  if (compra.estado === "datos") {
    return {
      ...base,
      pasos: pasos(nombres, actual, "error"),
      enCurso: false,
      tono: "advertencia",
      mensaje: "El registrador rechazó un dato del titular. Corregilo y seguimos solos.",
      corregir: { compraId: compra.id, campo: compra.campo, contacto: compra.contacto as unknown as Contacto },
    };
  }
  // En curso.
  const demora = compra.motivo ? " Puede tardar un poco más de lo normal: lo seguimos intentando solos." : "";
  const mensaje =
    tipo === "renovacion"
      ? `Pagado. Estamos renovando ${dominio}.${demora}`
      : actual <= 1
        ? `Pago recibido. Estamos registrando ${dominio} a nombre del titular.${demora}`
        : actual === 2
          ? `Registrado: ${dominio} ya es tuyo. Estamos conectando el sitio (puede tardar hasta una hora).${demora}`
          : `Configurando el certificado de https://${dominio}.${demora}`;
  return { ...base, pasos: pasos(nombres, actual, "en-curso"), enCurso: true, tono: compra.motivo ? "advertencia" : "info", mensaje };
}
