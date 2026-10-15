// Correo desde el dominio de la banda (docs/diseno-dominios.md §5):
//   - Envío: el dominio se da de alta en Resend (DominioDeEnvio). Delegado: Deoco carga sus
//     registros en la zona; conectado por CNAME: la banda los copia a su DNS. Verificado, los
//     correos de la banda salen desde merch@labanda.com (src/nucleo/correo/remitente-banda.ts).
//   - Recepción (solo delegados): Email Routing de Cloudflare → Email Worker
//     (infra/cloudflare/reenvio) → Resend al destino que eligió la banda. Si el dominio ya tiene
//     MX (su correo en Gmail, Outlook…), NO se toca: recepción "propio".
// Una dirección por banda. Bajo RLS (conTenant); solo el titular (o el staff) la configura.
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { esEmail } from "@/nucleo/correo/direccion";
import { transporte } from "@/nucleo/correo/transporte";
import { titularDeBanda } from "@/nucleo/personas";
import { dominioDeEnvio, type DominioDeEnvio, type DominioEnvio } from "./envio";
import { apexDe, ErrorDominio, esDePlataforma, ErrorProveedor, proveedorDns, type RegistroDns } from "./index";

const LOCAL = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
/** MX de Email Routing de Cloudflare: los nuestros, no "correo propio" de la banda. */
const MX_CLOUDFLARE = /\.mx\.cloudflare\.net\.?$/;

export type CorreoBanda = {
  dominioId: string;
  dominio: string;
  direccion: string;
  estado: "pendiente" | "verificado" | "fallido";
  /** Los registros que pide el envío. Delegado: ya están cargados; por CNAME: a copiar. */
  registros: RegistroDns[];
  cargadosPorDeoco: boolean;
  recepcion: "no" | "propio" | "activa";
  reenvioA: string | null;
};

/** Dominios de la banda que pueden mandar correo: propios, verificados (sin www). */
export async function dominiosParaCorreo(tenantId: string): Promise<{ id: string; dominio: string; via: string | null }[]> {
  const filas = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { verificado: true }, orderBy: { dominio: "asc" } }));
  const vistos = new Map<string, { id: string; dominio: string; via: string | null }>();
  for (const f of filas) {
    if (esDePlataforma(f.dominio)) continue;
    const apex = apexDe(f.dominio);
    // Si están el dominio y su www, la fila del dominio.
    if (!vistos.has(apex) || f.dominio === apex) vistos.set(apex, { id: f.id, dominio: apex, via: f.via });
  }
  return [...vistos.values()];
}

export async function correoDeBanda(tenantId: string): Promise<CorreoBanda | null> {
  const c = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst({ include: { dominioFila: { select: { via: true } } } }));
  if (!c) return null;
  return {
    dominioId: c.dominioId,
    dominio: c.dominio,
    direccion: `${c.local}@${c.dominio}`,
    estado: c.envioEstado as CorreoBanda["estado"],
    registros: Array.isArray(c.registros) ? (c.registros as RegistroDns[]) : [],
    cargadosPorDeoco: c.dominioFila.via === "zona",
    recepcion: c.recepcion as CorreoBanda["recepcion"],
    reenvioA: c.reenvioA,
  };
}

function envio(): DominioDeEnvio {
  const e = dominioDeEnvio();
  if (!e) throw new ErrorDominio("El correo desde tu dominio todavía no está habilitado en Deoco. Escribinos y lo vemos.");
  return e;
}

const errorDelProveedor = (e: unknown): never => {
  if (e instanceof ErrorProveedor) {
    console.warn("[correo-dominio]", e.message);
    throw new ErrorDominio(e.tipo === "temporal" ? "No pudimos hablar con el servicio de correo. Probá de nuevo en un rato." : "No pudimos preparar el correo de ese dominio. Escribinos y lo vemos.");
  }
  throw e;
};

/**
 * Configura (o cambia) la dirección de la banda: `local`@dominio. Da de alta el dominio en el
 * envío, carga sus registros si la zona es nuestra y, si el dominio está delegado y no tiene
 * correo propio, prende la recepción y reenvía a `reenvioA` (por defecto, al titular).
 */
export async function configurarCorreo(
  usuarioId: string,
  tenantId: string,
  datos: { dominioId: string; local: string; reenvioA?: string },
): Promise<CorreoBanda> {
  const local = datos.local.trim().toLowerCase();
  if (!LOCAL.test(local)) throw new ErrorDominio("La dirección solo lleva letras, números, puntos, guiones y guiones bajos (p. ej. merch).");
  const reenvioA = datos.reenvioA?.trim().toLowerCase() || undefined;
  if (reenvioA && !esEmail(reenvioA)) throw new ErrorDominio(`"${reenvioA}" no parece un email válido.`);
  const fila = (await dominiosParaCorreo(tenantId)).find((d) => d.id === datos.dominioId);
  if (!fila) throw new ErrorDominio("Elegí un dominio propio verificado de la banda.");
  const e = envio();
  const anterior = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst());
  const p = proveedorDns();

  const d: DominioEnvio = await e.crear(fila.dominio).catch(errorDelProveedor);
  // Delegado: los registros del envío los carga Deoco en la zona.
  const zona = fila.via === "zona" ? (await conTenant(tenantId, (tx) => tx.dominio.findUniqueOrThrow({ where: { id: fila.id } }))).proveedorId : null;
  let recepcion: CorreoBanda["recepcion"] = "no";
  if (zona && p) {
    try {
      const existentes = await p.registros(zona);
      for (const r of d.registros) {
        if (!existentes.some((x) => x.tipo === r.tipo && x.nombre === r.nombre && x.valor === r.valor)) {
          await p.crearRegistro(zona, { tipo: r.tipo, nombre: r.nombre, valor: r.valor, proxy: false, ...(r.prioridad !== undefined ? { prioridad: r.prioridad } : {}) });
        }
      }
      // ¿Ya tiene correo propio (MX en el dominio que no son de Cloudflare)? Entonces no se toca.
      const propio = existentes.some((x) => x.tipo === "MX" && x.nombre === fila.dominio && !MX_CLOUDFLARE.test(x.valor));
      recepcion = propio ? "propio" : "activa";
      if (recepcion === "activa") await p.prenderRecepcion(zona);
    } catch (err) {
      errorDelProveedor(err);
    }
  }
  const destino = recepcion === "activa" ? (reenvioA ?? (await conTenant(tenantId, (tx) => titularDeBanda(tx)))?.email ?? null) : (reenvioA ?? null);
  const direccion = `${local}@${fila.dominio}`;
  if (p && anterior && anterior.recepcion === "activa" && `${anterior.local}@${anterior.dominio}` !== direccion) {
    await p.fijarReenvio(`${anterior.local}@${anterior.dominio}`, null).catch(errorDelProveedor);
  }
  if (p && recepcion === "activa") await p.fijarReenvio(direccion, destino).catch(errorDelProveedor);
  if (anterior?.envioId && anterior.envioId !== d.id) await e.borrar(anterior.envioId).catch((err) => console.warn("[correo-dominio] no se pudo borrar el dominio de envío anterior:", err));

  const datosFila = {
    dominioId: fila.id,
    dominio: fila.dominio,
    local,
    envioId: d.id,
    envioEstado: d.estado,
    registros: d.registros.map(({ tipo, nombre, valor, para }) => ({ tipo, nombre, valor, para })),
    recepcion,
    reenvioA: destino,
    revisadoEn: null,
  };
  await conTenant(tenantId, async (tx) => {
    // Cambiar la dirección vuelve a esperar la verificación (salvo que el dominio ya esté verificado).
    await tx.correoDominio.upsert({ where: { tenantId }, create: { tenantId, ...datosFila }, update: datosFila });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "correo.configurado", detalle: { direccion, recepcion } } });
  });
  if (d.estado !== "verificado") await e.verificar(d.id).catch(() => {});
  return (await correoDeBanda(tenantId))!;
}

/** Pregunta al envío si el dominio ya está verificado. Con el cambio a verificado, avisa por mail. */
export async function revisarCorreo(tenantId: string, ahora = new Date()): Promise<CorreoBanda | null> {
  const c = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst());
  if (!c?.envioId) return correoDeBanda(tenantId);
  const e = envio();
  if (c.envioEstado !== "verificado") await e.verificar(c.envioId).catch(() => {});
  const d = await e.consultar(c.envioId).catch(errorDelProveedor);
  const estado = d?.estado ?? "fallido";
  await conTenant(tenantId, (tx) => tx.correoDominio.update({ where: { id: c.id }, data: { envioEstado: estado, revisadoEn: ahora } }));
  if (estado === "verificado" && c.envioEstado !== "verificado") {
    const direccion = `${c.local}@${c.dominio}`;
    await avisarAlTitular(tenantId, {
      clave: `correo-verificado:${direccion}:${c.envioId}`,
      asunto: () => `Tus mails ya salen desde ${direccion}`,
      parrafos: (banda) => [
        `Listo: los mails de ${banda} (compras, entradas y despachos) ya salen desde ${direccion}.`,
        ...(c.recepcion === "activa" && c.reenvioA ? [`Lo que te escriban a ${direccion} te llega a ${c.reenvioA}. Cuando respondas desde ahí, le respondés directo a quien te escribió.`] : []),
      ],
      boton: { texto: "Ver Correo", ruta: "/correo" },
    }).catch((err) => console.error("[correo-dominio] aviso de verificado:", err));
  }
  return correoDeBanda(tenantId);
}

/** Cada cuánto el barrido pregunta por las direcciones esperando verificación. */
export const REVISAR_CORREOS_CADA_MS = 10 * 60_000;

/** Barrido: revisa las direcciones de envío pendientes. Devuelve cuántas quedaron verificadas. */
export async function revisarCorreosPendientes(ahora = new Date()): Promise<number> {
  if (!dominioDeEnvio()) return 0;
  const antes = new Date(ahora.getTime() - REVISAR_CORREOS_CADA_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_correo_pendiente(${antes}::timestamp) AS b`;
  let verificadas = 0;
  for (const { id } of bandas) {
    const c = await revisarCorreo(id, ahora).catch((e) => {
      console.warn(`[correo-dominio] no se pudo revisar la dirección de ${id}:`, e instanceof Error ? e.message : e);
      return null;
    });
    if (c?.estado === "verificado") verificadas++;
  }
  return verificadas;
}

/** Deja de usar el dominio para el correo: los mails vuelven a salir desde Deoco. */
export async function quitarCorreo(usuarioId: string | null, tenantId: string): Promise<void> {
  const c = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst());
  if (!c) return;
  const p = proveedorDns();
  if (p && c.recepcion === "activa") await p.fijarReenvio(`${c.local}@${c.dominio}`, null).catch(errorDelProveedor);
  await conTenant(tenantId, async (tx) => {
    await tx.correoDominio.delete({ where: { id: c.id } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "correo.quitado", detalle: { direccion: `${c.local}@${c.dominio}` } } });
  });
  if (c.envioId) await dominioDeEnvio()?.borrar(c.envioId).catch((e) => console.warn("[correo-dominio] no se pudo borrar el dominio de envío:", e));
}

/**
 * Mail de prueba, ya (no espera la cola): sale desde la dirección de la banda. Con la recepción
 * activa va a esa misma dirección, así prueba también el reenvío; si no, al titular.
 */
export async function probarCorreo(tenantId: string): Promise<{ para: string; reenviaA: string | null }> {
  const c = await correoDeBanda(tenantId);
  if (!c) throw new ErrorDominio("Primero configurá la dirección.");
  if (c.estado !== "verificado") throw new ErrorDominio(`${c.direccion} todavía no está verificada: probá cuando lo esté.`);
  const t = transporte();
  if (!t) throw new ErrorDominio("Ahora no podemos mandar mails. Probá más tarde.");
  const { banda, titular } = await conTenant(tenantId, async (tx) => ({
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } }),
    titular: await titularDeBanda(tx),
  }));
  const para = c.recepcion === "activa" ? c.direccion : (titular?.email ?? c.direccion);
  const texto = `Este es un mail de prueba de ${banda.nombre} desde ${c.direccion}. Si lo estás leyendo, el correo de tu dominio anda.`;
  await t.enviar({
    id: `prueba-${Date.now()}`,
    de: { nombre: banda.nombre, direccion: c.direccion },
    para,
    asunto: `Prueba de correo desde ${c.direccion}`,
    html: `<p>${texto}</p>`,
    texto,
  });
  return { para, reenviaA: c.recepcion === "activa" ? c.reenvioA : null };
}
