// Salir de Deoco con un dominio delegado, sin pedirle nada a nadie (docs/diseno-dominios.md §2 y
// §3.2). La banda toca "Llevarme el DNS": Deoco arma la lista de registros para su DNS nuevo (lo
// suyo, el envío de correo y, si quiere seguir con el sitio en Deoco, el CNAME de www) y, si
// sigue con el sitio, crea el custom hostname de www y lo valida desde nuestra zona ANTES de que
// cambie los nameservers: cuando los cambia, www ya anda por CNAME, con certificado. El barrido
// detecta que los nameservers se fueron, pasa www a CNAME, da de baja la zona y avisa. Si nunca
// los cambia, a los 90 días se da de baja la zona (con aviso una semana antes).
//
// Lo mismo cuando la banda quita un dominio delegado y verificado (quitarDominio): la zona sigue
// andando 90 días (su correo, por ejemplo) para que cambie los nameservers.
import type { Prisma } from "@/generated/prisma/client";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
import { apexDe, destinoCname, ErrorDominio, ErrorProveedor, esDePlataforma, PLAZO_SALIDA_DIAS, type ProveedorDns, proveedorDns, type RegistroDns } from "./index";

export { PLAZO_SALIDA_DIAS };
export { enFormatoBind } from "./bind";

/** Cuántos días antes de dar de baja la zona se avisa por mail. */
export const AVISO_BAJA_DIAS = 7;
/** Cada cuánto se mira una salida en curso (para pasar www a CNAME apenas se van los nameservers). */
export const REVISAR_SALIDAS_CADA_MS = 10 * 60_000;

const DIA = 86_400_000;
const fechaLarga = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: ZONA });
const nombresDelSitio = (apex: string) => [apex, `www.${apex}`];
const DEL_SITIO = new Set(["A", "AAAA", "CNAME"]);

type Registro = RegistroDns & { prioridad?: number };

/** ¿Este registro de la zona solo sirve mientras la zona es nuestra? (No va al DNS nuevo.) */
function soloDeDeoco(r: { tipo: string; nombre: string; valor: string }, apex: string): boolean {
  if (nombresDelSitio(apex).includes(r.nombre) && DEL_SITIO.has(r.tipo)) return true; // el sitio, con proxy al VPS
  if (r.tipo === "MX" && /\.mx\.cloudflare\.net\.?$/.test(r.valor)) return true; // recepción de Deoco (Email Routing)
  if (r.tipo === "TXT" && r.valor.includes("include:_spf.mx.cloudflare.net")) return true;
  if (r.tipo === "TXT" && /^(_cf-custom-hostname|_acme-challenge)\./.test(r.nombre)) return true; // validación del custom hostname
  if (r.tipo === "TXT" && r.nombre.startsWith("_deoco.")) return true;
  return false;
}

/** Lo que la banda tiene que cargar en su DNS nuevo, a partir de lo que hay hoy en la zona. */
async function registrosParaLlevar(p: ProveedorDns, zonaId: string, apex: string, seguirConSitio: boolean): Promise<Registro[]> {
  const propios: Registro[] = (await p.registros(zonaId))
    .filter((r) => !soloDeDeoco(r, apex))
    .map((r) => ({
      tipo: r.tipo,
      nombre: r.nombre,
      valor: r.valor,
      para: `${/^send\.|_domainkey\./.test(r.nombre) ? "El envío de tus mails desde tu dominio." : "Ya estaba en tu dominio."}${r.prioridad !== undefined ? ` Prioridad ${r.prioridad}.` : ""}`,
      ...(r.prioridad !== undefined ? { prioridad: r.prioridad } : {}),
    }));
  return seguirConSitio
    ? [{ tipo: "CNAME", nombre: `www.${apex}`, valor: destinoCname(), para: "El sitio, que sigue en Deoco." }, ...propios]
    : propios;
}

function proveedor(): ProveedorDns {
  const p = proveedorDns();
  if (!p) throw new ErrorDominio("Los dominios propios todavía no están habilitados en Deoco. Escribinos y lo vemos.");
  return p;
}

/** Pone los TXT de validación del custom hostname en nuestra zona (mientras sea nuestra). */
async function validarDesdeLaZona(p: ProveedorDns, zonaId: string, validacion: RegistroDns[]) {
  if (validacion.length === 0) return;
  const existentes = await p.registros(zonaId);
  for (const v of validacion) {
    if (!existentes.some((x) => x.tipo === v.tipo && x.nombre === v.nombre && x.valor === v.valor)) {
      await p.crearRegistro(zonaId, { tipo: v.tipo, nombre: v.nombre, valor: v.valor, proxy: false });
    }
  }
}

/**
 * "Llevarme el DNS". `seguirConSitio`: www sigue en Deoco por CNAME (el dominio sin www lo redirige
 * la banda en su proveedor). Si no, el principal pasa ya al subdominio de Deoco.
 */
export async function llevarseElDns(usuarioId: string, tenantId: string, dominioId: string, opciones: { seguirConSitio: boolean }): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d) throw new ErrorDominio("Ese dominio no es de esta banda.");
  if (d.via !== "zona" || !d.verificado || !d.proveedorId) throw new ErrorDominio(`${d.dominio} no está delegado en Deoco: su DNS ya es tuyo.`);
  const zonaId = d.proveedorId;
  const apex = apexDe(d.dominio);
  if (await conTenant(tenantId, (tx) => tx.zonaSaliente.findFirst({ where: { zonaId } }))) return; // ya en curso
  const p = proveedor();
  try {
    let hostnameId: string | null = null;
    if (opciones.seguirConSitio) {
      const h = await p.crearHostname(`www.${apex}`, { porTxt: true });
      hostnameId = h.id;
      await validarDesdeLaZona(p, zonaId, h.validacion);
    }
    const registros = await registrosParaLlevar(p, zonaId, apex, opciones.seguirConSitio);
    await conTenant(tenantId, async (tx) => {
      await tx.zonaSaliente.create({
        data: {
          tenantId,
          zonaId,
          dominio: apex,
          seLlevaElDns: true,
          seguirConSitio: opciones.seguirConSitio,
          hostnameId,
          registros: registros as unknown as Prisma.InputJsonValue,
          bajaEn: new Date(Date.now() + PLAZO_SALIDA_DIAS * DIA),
        },
      });
      // Sin el sitio en Deoco: el principal vuelve ya al subdominio (que nunca se va).
      if (!opciones.seguirConSitio) await volverAlSubdominioSiHaceFalta(tx, zonaId);
      await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "dominio.saliendo", detalle: { dominio: apex, seguirConSitio: opciones.seguirConSitio } } });
    });
  } catch (e) {
    if (e instanceof ErrorProveedor) {
      console.warn(`[dominios] salida de ${apex}:`, e.message);
      throw new ErrorDominio(e.tipo === "temporal" ? "No pudimos hablar con Cloudflare. Probá de nuevo en un rato." : `No pudimos preparar la salida de ${apex}. Escribinos y lo vemos.`);
    }
    throw e;
  }
}

/** Si el principal es de esta zona, pasa al subdominio de Deoco. */
async function volverAlSubdominioSiHaceFalta(tx: Prisma.TransactionClient, zonaId: string) {
  const principal = await tx.dominio.findFirst({ where: { esPrincipal: true } });
  if (!principal || principal.via !== "zona" || principal.proveedorId !== zonaId) return;
  const sub = (await tx.dominio.findMany({ where: { verificado: true } })).find((x) => esDePlataforma(x.dominio));
  if (!sub) return;
  await tx.dominio.update({ where: { id: principal.id }, data: { esPrincipal: false } });
  await tx.dominio.update({ where: { id: sub.id }, data: { esPrincipal: true } });
}

/** "Me quedo en Deoco": cancela la salida (solo si todavía no se fue). */
export async function quedarseEnDeoco(usuarioId: string, tenantId: string, dominioId: string): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { id: dominioId } }));
  if (!d?.proveedorId) throw new ErrorDominio("Ese dominio no es de esta banda.");
  const s = await conTenant(tenantId, (tx) => tx.zonaSaliente.findFirst({ where: { zonaId: d.proveedorId! } }));
  if (!s) return;
  await conTenant(tenantId, async (tx) => {
    await tx.zonaSaliente.delete({ where: { id: s.id } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "dominio.se_queda", detalle: { dominio: s.dominio } } });
  });
  if (s.hostnameId) await proveedorDns()?.borrarHostname(s.hostnameId).catch((e) => console.warn(`[dominios] hostname de ${s.dominio}:`, e));
}

/**
 * Barrido: cada salida en curso.
 *   - Seguir con el sitio: el custom hostname de www se valida desde la zona; activo, www pasa a
 *     CNAME (y a principal, si lo era el dominio sin www).
 *   - Los nameservers se fueron (zona "moved" o borrada), o pasaron los 90 días: se termina
 *     (filas de la zona y zona) y se avisa.
 *   - Una semana antes de los 90 días: aviso.
 */
export async function revisarSalidas(ahora = new Date()): Promise<{ terminadas: number }> {
  const p = proveedorDns();
  if (!p) return { terminadas: 0 };
  const antes = new Date(ahora.getTime() - REVISAR_SALIDAS_CADA_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_zonas_salientes(${antes}::timestamp) AS b`;
  let terminadas = 0;
  for (const { id: tenantId } of bandas) {
    const salidas = await conTenant(tenantId, (tx) =>
      tx.zonaSaliente.findMany({ where: { OR: [{ revisadoEn: null }, { revisadoEn: { lt: antes } }] } }),
    );
    for (const s of salidas) {
      try {
        if (await revisarSalida(tenantId, s, p, ahora)) terminadas++;
      } catch (e) {
        console.warn(`[dominios] no se pudo revisar la salida de ${s.dominio}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return { terminadas };
}

type Salida = Awaited<ReturnType<typeof prisma.zonaSaliente.findFirstOrThrow>>;

async function revisarSalida(tenantId: string, s: Salida, p: ProveedorDns, ahora: Date): Promise<boolean> {
  const z = await p.zona(s.zonaId);
  const seFueron = !z || z.estado === "moved" || z.estado === "deleted";
  if (s.seguirConSitio && s.hostnameId) await sitioPorCname(tenantId, s, p, z?.estado === "active", seFueron);

  if (seFueron || ahora >= s.bajaEn) {
    await terminar(tenantId, s, p, seFueron ? "nameservers" : "plazo");
    return true;
  }
  const avisar = !s.avisadoEn && ahora.getTime() >= s.bajaEn.getTime() - AVISO_BAJA_DIAS * DIA;
  await conTenant(tenantId, (tx) => tx.zonaSaliente.update({ where: { id: s.id }, data: { revisadoEn: ahora, ...(avisar ? { avisadoEn: ahora } : {}) } }));
  if (avisar) {
    await avisarAlTitular(tenantId, {
      clave: `zona-baja-aviso:${s.zonaId}:${s.desde.toISOString()}`,
      asunto: () => `${s.dominio}: el ${fechaLarga(s.bajaEn)} damos de baja su DNS en Deoco`,
      parrafos: () => [
        `${s.dominio} sigue usando los nameservers de Deoco.${s.seLlevaElDns ? " Pediste llevarte el DNS, pero todavía no los cambiaste." : " Lo quitaste de tu banda, pero su DNS sigue en Deoco."}`,
        `El ${fechaLarga(s.bajaEn)} damos de baja su DNS en Deoco: si para entonces los nameservers no cambiaron, el dominio deja de andar (también su correo, si lo tiene).`,
        "Cargá los registros de tu dominio en tu proveedor nuevo y cambiá los nameservers donde lo registraste. La lista está en Dominios.",
      ],
      boton: { texto: "Ver Dominios", ruta: "/dominios" },
    }).catch((e) => console.error(`[dominios] aviso de baja de ${s.dominio}:`, e));
  }
  return false;
}

/** El sitio sigue en Deoco por CNAME (www): validar desde la zona y, activo, pasar www. */
async function sitioPorCname(tenantId: string, s: Salida, p: ProveedorDns, zonaActiva: boolean, seFueron: boolean) {
  let h = await p.hostname(s.hostnameId!);
  if (!h || (seFueron && h.estado !== "active")) {
    // Se borró, o los nameservers se fueron antes de validarlo: la validación por TXT ya no
    // se puede poner en la zona; uno nuevo, por HTTP (alcanza con el CNAME de su DNS nuevo).
    if (h) await p.borrarHostname(h.id).catch(() => {});
    h = await p.crearHostname(`www.${s.dominio}`, seFueron ? {} : { porTxt: true });
    await conTenant(tenantId, (tx) => tx.zonaSaliente.update({ where: { id: s.id }, data: { hostnameId: h!.id } }));
  }
  if (h.estado !== "active" && zonaActiva) await validarDesdeLaZona(p, s.zonaId, h.validacion);
  const listo = h.estado === "active" && h.ssl === "active";
  if (!listo && !seFueron) return;
  // Las renovaciones del certificado, por HTTP: el DNS va a dejar de ser nuestro.
  if (listo) await p.validarPorHttp(h.id);
  const hostname = h;
  await conTenant(tenantId, async (tx) => {
    const www = await tx.dominio.findFirst({ where: { dominio: `www.${s.dominio}`, via: "zona", proveedorId: s.zonaId } });
    if (!www) return;
    await tx.dominio.update({
      where: { id: www.id },
      data: { via: "cname", proveedorId: hostname.id, estadoProveedor: hostname.estado, certificado: hostname.ssl, validacion: [], problemaDesde: null, problema: null, fallasSeguidas: 0 },
    });
    // Si el principal era el dominio sin www (que deja de llegar a Deoco), pasa a www.
    const apex = await tx.dominio.findFirst({ where: { dominio: s.dominio, via: "zona", esPrincipal: true } });
    if (apex) {
      await tx.dominio.update({ where: { id: apex.id }, data: { esPrincipal: false } });
      await tx.dominio.update({ where: { id: www.id }, data: { esPrincipal: true } });
    }
    await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.conectado_por_cname", detalle: { dominio: www.dominio, por: "salida" } } });
  });
}

async function terminar(tenantId: string, s: Salida, p: ProveedorDns, por: "nameservers" | "plazo") {
  const borrarZona = await conTenant(tenantId, async (tx) => {
    // Lo que quede en la zona deja de llegar a Deoco: si era el principal, vuelve el subdominio.
    await volverAlSubdominioSiHaceFalta(tx, s.zonaId);
    await tx.dominio.deleteMany({ where: { via: "zona", proveedorId: s.zonaId } });
    await tx.zonaSaliente.delete({ where: { id: s.id } });
    await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.salio", detalle: { dominio: s.dominio, por } } });
    return true;
  });
  const [{ deOtra }] = await prisma.$queryRaw<{ deOtra: boolean }[]>`SELECT zona_de_otra_banda(${s.zonaId}, ${tenantId}::uuid) AS "deOtra"`;
  if (borrarZona && !deOtra) await p.borrarZona(s.zonaId).catch((e) => console.warn(`[dominios] no se pudo borrar la zona de ${s.dominio}:`, e));
  console.log(`[dominios] ${s.dominio}: salió de Deoco (${por}).`);
  await avisarAlTitular(tenantId, {
    clave: `zona-salio:${s.zonaId}:${s.desde.toISOString()}`,
    asunto: () => (por === "nameservers" ? `${s.dominio} ya no usa los nameservers de Deoco` : `Dimos de baja el DNS de ${s.dominio} en Deoco`),
    parrafos: () => [
      por === "nameservers"
        ? `Vimos que ${s.dominio} ya usa otros nameservers: listo, su DNS es tuyo.`
        : `Pasaron ${PLAZO_SALIDA_DIAS} días y ${s.dominio} seguía usando los nameservers de Deoco: dimos de baja su DNS en Deoco.`,
      s.seguirConSitio
        ? `Tu sitio sigue en Deoco en www.${s.dominio} (por el CNAME de tu DNS). El dominio sin www lo redirigís vos desde tu proveedor.`
        : "Tu sitio sigue en tu subdominio de Deoco.",
    ],
    boton: { texto: "Ver Dominios", ruta: "/dominios" },
  }).catch((e) => console.error(`[dominios] aviso de salida de ${s.dominio}:`, e));
}
