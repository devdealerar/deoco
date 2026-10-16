// Legal del sitio de cada banda (D2; docs/privacidad.md): la política de privacidad y los términos
// del sitio se arman con los datos de la banda (responsable, domicilio, contacto) y lo que tiene
// prendido; cada texto publicado queda guardado como versión, y cada pedido o compra guarda la
// versión que tenía a la vista. Y lo que la banda le acepta a Deoco (términos del servicio y
// contrato de encargo de tratamiento), con fecha, versión y quién.
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { esEmail } from "@/nucleo/correo/direccion";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { registro } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { DOCUMENTOS_DEOCO, LEYENDA_AAIP, SUBENCARGADOS } from "./textos";

export class ErrorLegal extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorLegal";
  }
}

export type DatosLegales = { responsable: string; domicilio: string; emailDatos: string; extraPrivacidad: string; extraTerminos: string };
export type TipoLegal = "privacidad" | "terminos";

const VACIO: DatosLegales = { responsable: "", domicilio: "", emailDatos: "", extraPrivacidad: "", extraTerminos: "" };

export async function datosLegales(tenantId: string): Promise<DatosLegales> {
  const f = await conTenant(tenantId, (tx) => tx.legalBanda.findUnique({ where: { tenantId } }));
  return f ? { responsable: f.responsable, domicilio: f.domicilio, emailDatos: f.emailDatos, extraPrivacidad: f.extraPrivacidad, extraTerminos: f.extraTerminos } : VACIO;
}

/** ¿Están los datos mínimos del responsable (Ley 25.326 art. 6 b: identidad y domicilio)? */
export const faltanDatos = (d: DatosLegales) => !d.responsable.trim() || !d.domicilio.trim();

/**
 * El texto de la política de privacidad del sitio. Líneas: "# título", "## sección" y párrafos.
 * Lo que dice depende de los módulos prendidos (cada uno cuenta qué recolecta, con quién lo comparte
 * y su sección de los términos: `datosPersonales` del contrato).
 */
type Recolecta = NonNullable<Modulo["datosPersonales"]>;

function textoPrivacidad(banda: string, d: DatosLegales, modulos: Recolecta[]): string {
  const responsable = d.responsable.trim() || banda;
  const contacto = d.emailDatos.trim() ? `escribiendo a ${d.emailDatos.trim()} o desde "Tus datos personales" (/datos-personales), al pie de este sitio` : `desde "Tus datos personales" (/datos-personales), al pie de este sitio`;
  const recolecta = [...modulos.map((m) => m.queRecolecta), "Si nos escribís o pedís algo sobre tus datos: lo que pongas en el formulario."];
  return [
    `# Política de privacidad de ${banda}`,
    "## Quién es responsable de tus datos",
    `${responsable}${d.domicilio.trim() ? `, con domicilio en ${d.domicilio.trim()}` : ""}, es responsable de la base de datos de las personas que compran o se registran en este sitio.`,
    "El sitio funciona sobre Deoco, que trata los datos por cuenta de la banda (encargado de tratamiento) y solo para darle el servicio: nunca los usa para otra cosa, no los vende y no los cruza con los de otras bandas.",
    "## Qué datos se recolectan y para qué",
    ...recolecta,
    "Los datos se usan para cumplir lo que pediste (mandarte tu compra, emitir y validar tus entradas, responderte) y por las obligaciones legales de la venta (comprobantes). Si un dato es obligatorio y no lo das, no se puede completar la compra.",
    "## Con quién se comparten",
    ...modulos.map((m) => m.compartidoCon ?? ""),
    "Con la pasarela de pago de la banda, que procesa el pago (Deoco no ve ni guarda los datos de tu tarjeta).",
    `Con los proveedores técnicos de Deoco: ${SUBENCARGADOS.map((s) => `${s.quien} (${s.para}; ${s.pais})`).join("; ")}.`,
    "## Cookies",
    "Este sitio usa solo cookies necesarias para funcionar (recordar tu carrito y el acceso a tus compras). Si en algún momento se suman cookies de analítica o publicidad, se te van a pedir antes, y podés cambiar tu decisión cuando quieras desde \"Preferencias de cookies\".",
    "## Tus derechos",
    `Podés pedir acceso a tus datos, que se corrijan o actualicen, que se borren o que dejen de usarse para comunicaciones, ${contacto}. El acceso es gratuito a intervalos no inferiores a seis meses, salvo que acredites un interés legítimo. Se responde dentro de los 10 días corridos (acceso) y de los 5 días hábiles (corrección o borrado). Lo que la ley obliga a conservar (por ejemplo, los comprobantes de una venta) se conserva, sin usarse para otra cosa.`,
    "Si vivís en Brasil, también tenés los derechos de la LGPD (Lei 13.709/2018, art. 18), que podés ejercer por el mismo medio.",
    LEYENDA_AAIP,
    d.extraPrivacidad.trim() ? "## Además" : "",
    d.extraPrivacidad.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function textoTerminos(banda: string, d: DatosLegales, modulos: Recolecta[]): string {
  const responsable = d.responsable.trim() || banda;
  return [
    `# Términos y condiciones de ${banda}`,
    "## Quién vende",
    `Las ventas de este sitio las hace ${responsable}${d.domicilio.trim() ? ` (${d.domicilio.trim()})` : ""}. El pago va directo a la cuenta de la banda. El sitio funciona sobre Deoco, que no vende ni cobra: da la plataforma.`,
    ...modulos.flatMap((m) => (m.terminos ? [`## ${m.terminos.titulo}`, m.terminos.texto] : [])),
    "## Arrepentimiento",
    `Podés revocar la compra dentro de los 10 días corridos desde que la hiciste o recibiste el producto, sin dar motivos, desde el "Botón de arrepentimiento" (/arrepentimiento), al pie de este sitio (Ley 24.240 de Defensa del Consumidor). Te confirmamos el pedido con un código.`,
    "## Tus datos",
    "Cómo se tratan tus datos está en la política de privacidad (/privacidad).",
    d.extraTerminos.trim() ? "## Además" : "",
    d.extraTerminos.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function generar(tx: TxTenant, tenantId: string, tipo: TipoLegal): Promise<string> {
  const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
  const f = await tx.legalBanda.findUnique({ where: { tenantId } });
  const d = f ?? VACIO;
  // Lo que dice depende de lo que la banda tiene prendido: cada módulo cuenta qué recolecta.
  const prendidos = await modulosPrendidos(tenantId);
  const modulos = registro()
    .modulos.filter((m) => m.datosPersonales && prendidos.has(m.id))
    .map((m) => m.datosPersonales!);
  return tipo === "privacidad" ? textoPrivacidad(banda, d, modulos) : textoTerminos(banda, d, modulos);
}

/**
 * La versión vigente del texto (la última publicada). Si el texto que corresponde hoy cambió
 * (otros datos, otro módulo prendido), se publica una versión nueva: lo que se muestra siempre es
 * una versión guardada.
 */
export async function textoVigente(tenantId: string, tipo: TipoLegal): Promise<{ id: string; version: number; contenido: string; publicadaEn: Date }> {
  return conTenant(tenantId, async (tx) => {
    const contenido = await generar(tx, tenantId, tipo);
    const ultima = await tx.legalVersion.findFirst({ where: { tipo }, orderBy: { version: "desc" } });
    if (ultima && ultima.contenido === contenido) return ultima;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:legal:${tipo}`}))`;
    const otra = await tx.legalVersion.findFirst({ where: { tipo }, orderBy: { version: "desc" } });
    if (otra && otra.contenido === contenido) return otra;
    return tx.legalVersion.create({ data: { tenantId, tipo, version: (otra?.version ?? 0) + 1, contenido } });
  });
}

/** La versión de la política de privacidad que un pedido o compra guarda (el número). */
export const versionDePrivacidad = async (tenantId: string) => (await textoVigente(tenantId, "privacidad")).version;

/** El titular guarda los datos del responsable. La política y los términos se republican solos. */
export async function guardarDatosLegales(tenantId: string, usuarioId: string, d: DatosLegales): Promise<void> {
  const datos = {
    responsable: d.responsable.trim().slice(0, 200),
    domicilio: d.domicilio.trim().slice(0, 300),
    emailDatos: d.emailDatos.trim().toLowerCase().slice(0, 200),
    extraPrivacidad: d.extraPrivacidad.trim().slice(0, 4000),
    extraTerminos: d.extraTerminos.trim().slice(0, 4000),
  };
  if (datos.emailDatos && !esEmail(datos.emailDatos)) throw new ErrorLegal("Revisá el email para datos personales.");
  await conTenant(tenantId, async (tx) => {
    await tx.legalBanda.upsert({ where: { tenantId }, create: { tenantId, ...datos }, update: { ...datos, actualizadoEn: new Date() } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "legal.datos_guardados", detalle: { responsable: datos.responsable, domicilio: datos.domicilio } } });
  });
}

/** Las versiones publicadas (para la banda: qué texto vio cada fan). */
export const versionesLegales = (tenantId: string) => conTenant(tenantId, (tx) => tx.legalVersion.findMany({ orderBy: [{ tipo: "asc" }, { version: "desc" }], take: 50 }));

// ── Lo que la banda le acepta a Deoco ─────────────────────────────────────────────────────────

/** Los documentos de Deoco que el titular todavía no aceptó en su versión vigente. */
export async function pendientesDeAceptar(tenantId: string) {
  const hechas = await conTenant(tenantId, (tx) => tx.aceptacionLegal.findMany({ select: { documento: true, version: true } }));
  return DOCUMENTOS_DEOCO.filter((doc) => !hechas.some((h) => h.documento === doc.id && h.version === doc.version));
}

/** El titular acepta los documentos vigentes de Deoco: una fila por documento, con fecha y versión. */
export async function aceptarDocumentos(tenantId: string, usuarioId: string): Promise<number> {
  const faltan = await pendientesDeAceptar(tenantId);
  if (!faltan.length) return 0;
  await conTenant(tenantId, async (tx) => {
    await tx.aceptacionLegal.createMany({ data: faltan.map((d) => ({ tenantId, usuarioId, documento: d.id, version: d.version })) });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "legal.documentos_aceptados", detalle: { documentos: faltan.map((d) => `${d.id}@${d.version}`) } } });
  });
  return faltan.length;
}

export const aceptacionesDe = (tenantId: string) => conTenant(tenantId, (tx) => tx.aceptacionLegal.findMany({ orderBy: { aceptadoEn: "desc" } }));

/** Para la ficha de la banda en el registro (módulos que recolectan datos). */
export const modulosQueRecolectan = () => registro().modulos.filter((m) => m.datosPersonales).map((m) => m.id);
