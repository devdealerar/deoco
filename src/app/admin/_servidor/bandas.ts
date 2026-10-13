import { randomInt } from "node:crypto";
import { Prisma, type EstadoTenant } from "@/generated/prisma/client";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin, type TxAdmin } from "./db";

export type FilaBanda = {
  id: string;
  nombre: string;
  slug: string;
  estado: EstadoTenant;
  dominio: string | null;
  modulos: string[];
  usado: bigint;
  limite: bigint | null;
  creadoEn: Date;
};

/** Todas las bandas, con su estado, módulos prendidos y espacio usado. */
export async function listarBandas(): Promise<FilaBanda[]> {
  const db = dbAdmin();
  const [bandas, uso] = await Promise.all([
    db.tenant.findMany({
      orderBy: { nombre: "asc" },
      include: { dominios: { where: { esPrincipal: true }, select: { dominio: true } }, modulos: { select: { moduloId: true } } },
    }),
    db.archivo.groupBy({ by: ["tenantId"], _sum: { bytes: true } }),
  ]);
  const usado = new Map(uso.map((u) => [u.tenantId, u._sum.bytes ?? BigInt(0)]));
  return bandas.map((b) => ({
    id: b.id,
    nombre: b.nombre,
    slug: b.slug,
    estado: b.estado,
    dominio: b.dominios[0]?.dominio ?? null,
    modulos: b.modulos.map((m) => m.moduloId).sort(),
    usado: usado.get(b.id) ?? BigInt(0),
    limite: b.limiteAlmacenamiento,
    creadoEn: b.creadoEn,
  }));
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Subdominios que son de la plataforma, no de una banda. */
const RESERVADOS = ["app", "www", "admin", "api", "mail", "static", "assets", "deoco", "nueva"];

/** Clave temporal legible (sin 0/O/1/l): se muestra una sola vez al staff. */
function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  const bloque = () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join("");
  return `${bloque()}-${bloque()}-${bloque()}`;
}

export type DatosAlta = {
  nombre: string;
  slug: string;
  subdominio: string;
  titularEmail: string;
  titularNombre: string;
};

/**
 * Alta de una banda: tenant + subdominio principal + titular (usuario existente o nuevo
 * con clave temporal). Todo en una transacción, con su registro de auditoría.
 */
export async function altaBanda(staffId: string, datos: DatosAlta) {
  const slug = datos.slug.toLowerCase();
  const sub = (datos.subdominio || slug).toLowerCase();
  if (!datos.nombre) throw new ErrorFormulario("Falta el nombre de la banda.");
  for (const [valor, que] of [
    [slug, "El slug"],
    [sub, "El subdominio"],
  ] as const) {
    if (valor.length < 2 || valor.length > 40 || !SLUG.test(valor)) {
      throw new ErrorFormulario(`${que} "${valor}" no es válido: minúsculas, números y guiones (2 a 40).`);
    }
    if (RESERVADOS.includes(valor)) throw new ErrorFormulario(`${que} "${valor}" está reservado para la plataforma.`);
  }
  const dominio = `${sub}.${dominioRaiz()}`;
  const email = datos.titularEmail.toLowerCase();

  const db = dbAdmin();
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.tenant.findUnique({ where: { slug } })) throw new ErrorFormulario(`Ya existe una banda con el slug "${slug}".`);
      if (await tx.dominio.findUnique({ where: { dominio } })) throw new ErrorFormulario(`El dominio ${dominio} ya está en uso.`);

      let titular = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
      let clave: string | null = null;
      if (!titular) {
        if (!datos.titularNombre) {
          throw new ErrorFormulario(`No hay ningún usuario con el email ${email}: completá su nombre para crearlo.`);
        }
        clave = claveTemporal();
        titular = await tx.usuario.create({
          data: { email, nombre: datos.titularNombre, hashContrasena: await hashearContrasena(clave), claveTemporal: true },
          select: { id: true },
        });
        await auditar(tx, { usuarioId: staffId, accion: "usuario.creado", detalle: { usuarioId: titular.id, email } });
      }

      const banda = await tx.tenant.create({ data: { nombre: datos.nombre, slug } });
      await tx.dominio.create({ data: { tenantId: banda.id, dominio, esPrincipal: true, verificado: true } });
      await tx.membresia.create({ data: { tenantId: banda.id, usuarioId: titular.id, rol: "TITULAR" } });
      await auditar(tx, {
        usuarioId: staffId,
        tenantId: banda.id,
        accion: "banda.creada",
        detalle: { nombre: datos.nombre, slug, dominio, titular: email, titularNuevo: clave !== null },
      });
      return { tenantId: banda.id, slug, dominio, titular: email, claveTemporal: clave };
    });
  } catch (e) {
    // Dos altas simultáneas con el mismo slug/dominio/email: la base frena la segunda.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ErrorFormulario("Otro alta tomó ese slug, dominio o email recién. Revisá y probá de nuevo.");
    }
    throw e;
  }
}

// ── detalle y cambios de una banda ─────────────────────────────────────────

export async function detalleBanda(slug: string) {
  const db = dbAdmin();
  const banda = await db.tenant.findUnique({
    where: { slug },
    include: {
      dominios: { orderBy: [{ esPrincipal: "desc" }, { dominio: "asc" }] },
      modulos: { select: { moduloId: true } },
      membresias: { include: { usuario: { select: { id: true, email: true, nombre: true, claveTemporal: true } } } },
    },
  });
  if (!banda) return null;
  const orden = ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"];
  banda.membresias.sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol) || a.usuario.email.localeCompare(b.usuario.email));
  return banda;
}

const ESTADOS: EstadoTenant[] = ["ACTIVO", "MOROSO", "SUSPENDIDO", "ARCHIVADO"];

/** Cambia el estado. ARCHIVADO apaga panel y sitio: exige confirmación explícita. */
export async function cambiarEstado(staffId: string, tenantId: string, estado: string, confirmado: boolean) {
  if (!ESTADOS.includes(estado as EstadoTenant)) throw new ErrorFormulario("Elegí un estado.");
  if (estado === "ARCHIVADO" && !confirmado) {
    throw new ErrorFormulario("Para archivar, confirmá que el panel y el sitio de la banda van a dejar de responder.");
  }
  await dbAdmin().$transaction(async (tx) => {
    const antes = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { estado: true } });
    if (antes.estado === estado) return;
    await tx.tenant.update({ where: { id: tenantId }, data: { estado: estado as EstadoTenant } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "banda.estado_cambiado", detalle: { de: antes.estado, a: estado } });
  });
}

const DOMINIO = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Registra un dominio propio (sin verificar: la verificación DNS llega después). */
export async function agregarDominio(staffId: string, tenantId: string, dominioCrudo: string) {
  const dominio = dominioCrudo.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!DOMINIO.test(dominio)) throw new ErrorFormulario(`"${dominioCrudo}" no es un dominio válido (p. ej. labanda.com).`);
  const raiz = dominioRaiz();
  if (dominio === raiz || dominio.endsWith(`.${raiz}`)) {
    throw new ErrorFormulario(`Los subdominios de ${raiz} los asigna la plataforma: acá va un dominio propio de la banda.`);
  }
  await dbAdmin().$transaction(async (tx) => {
    if (await tx.dominio.findUnique({ where: { dominio } })) throw new ErrorFormulario(`El dominio ${dominio} ya está en uso.`);
    await tx.dominio.create({ data: { tenantId, dominio, esPrincipal: false, verificado: false } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "dominio.agregado", detalle: { dominio } });
  });
}

/** Marca el dominio principal de la banda (hay uno solo). */
export async function marcarPrincipal(staffId: string, tenantId: string, dominioId: string) {
  await dbAdmin().$transaction(async (tx) => {
    const d = await tx.dominio.findFirst({ where: { id: dominioId, tenantId } });
    if (!d) throw new ErrorFormulario("Ese dominio no es de esta banda.");
    if (d.esPrincipal) return;
    await tx.dominio.updateMany({ where: { tenantId, esPrincipal: true }, data: { esPrincipal: false } });
    await tx.dominio.update({ where: { id: d.id }, data: { esPrincipal: true } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "dominio.principal_marcado", detalle: { dominio: d.dominio } });
  });
}

// ── miembros ───────────────────────────────────────────────────────────────

const ROLES = ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"] as const;
type Rol = (typeof ROLES)[number];

function rolValido(rol: string): Rol {
  if (!ROLES.includes(rol as Rol)) throw new ErrorFormulario("Elegí un rol.");
  return rol as Rol;
}

/** Bloquea la fila de la banda: dos cambios de miembros a la vez no la dejan sin titular. */
async function bloquearBanda(tx: TxAdmin, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM "tenant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
}

async function quedaTitular(tx: TxAdmin, tenantId: string, sinMembresia: string) {
  const otros = await tx.membresia.count({ where: { tenantId, rol: "TITULAR", NOT: { id: sinMembresia } } });
  if (otros === 0) throw new ErrorFormulario("La banda no puede quedar sin titular: sumá o asigná otro titular antes.");
}

/**
 * Invita a alguien a la banda con un rol. Si no tiene usuario, se crea con clave temporal
 * (que tendrá que cambiar en su primer ingreso) y se devuelve para pasársela.
 */
export async function invitar(staffId: string, tenantId: string, datos: { email: string; nombre: string; rol: string }) {
  const rol = rolValido(datos.rol);
  const email = datos.email.toLowerCase();
  return dbAdmin().$transaction(async (tx) => {
    let usuario = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
    let clave: string | null = null;
    if (!usuario) {
      if (!datos.nombre) throw new ErrorFormulario(`No hay ningún usuario con el email ${email}: completá su nombre para crearlo.`);
      clave = claveTemporal();
      usuario = await tx.usuario.create({
        data: { email, nombre: datos.nombre, hashContrasena: await hashearContrasena(clave), claveTemporal: true },
        select: { id: true },
      });
      await auditar(tx, { usuarioId: staffId, accion: "usuario.creado", detalle: { usuarioId: usuario.id, email } });
    }
    if (await tx.membresia.findUnique({ where: { usuarioId_tenantId: { usuarioId: usuario.id, tenantId } } })) {
      throw new ErrorFormulario(`${email} ya es miembro de esta banda.`);
    }
    await tx.membresia.create({ data: { tenantId, usuarioId: usuario.id, rol } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "membresia.invitada", detalle: { email, rol, usuarioNuevo: clave !== null } });
    return { email, claveTemporal: clave };
  });
}

export async function cambiarRol(staffId: string, tenantId: string, membresiaId: string, nuevoRol: string) {
  const rol = rolValido(nuevoRol);
  await dbAdmin().$transaction(async (tx) => {
    await bloquearBanda(tx, tenantId);
    const m = await tx.membresia.findFirst({ where: { id: membresiaId, tenantId }, include: { usuario: { select: { email: true } } } });
    if (!m) throw new ErrorFormulario("Esa persona ya no es miembro de esta banda.");
    if (m.rol === rol) return;
    if (m.rol === "TITULAR") await quedaTitular(tx, tenantId, m.id);
    await tx.membresia.update({ where: { id: m.id }, data: { rol } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "membresia.rol_cambiado", detalle: { email: m.usuario.email, de: m.rol, a: rol } });
  });
}

/** Quita a alguien de la banda. Exige confirmación explícita, como archivar. */
export async function quitarMiembro(staffId: string, tenantId: string, membresiaId: string, confirmado: boolean) {
  await dbAdmin().$transaction(async (tx) => {
    await bloquearBanda(tx, tenantId);
    const m = await tx.membresia.findFirst({ where: { id: membresiaId, tenantId }, include: { usuario: { select: { email: true } } } });
    if (!m) return;
    if (!confirmado) {
      throw new ErrorFormulario(
        m.usuarioId === staffId
          ? "Te estás quitando a vos mismo de esta banda: perdés tu membresía y tu rol en ella (como staff seguís pudiendo entrar). Para hacerlo, confirmalo."
          : `Para quitar a ${m.usuario.email} de la banda, confirmalo: pierde el acceso a su panel.`,
      );
    }
    if (m.rol === "TITULAR") await quedaTitular(tx, tenantId, m.id);
    await tx.membresia.delete({ where: { id: m.id } });
    await auditar(tx, { usuarioId: staffId, tenantId, accion: "membresia.quitada", detalle: { email: m.usuario.email, rol: m.rol } });
  });
}
