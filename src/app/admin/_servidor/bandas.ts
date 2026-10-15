import { registro } from "@/nucleo/modulos";
import { problemaDeSubdominio } from "@/nucleo/tenant/reservados";
import { Prisma, type EstadoTenant } from "@/generated/prisma/client";
import { claveTemporal } from "@/nucleo/auth/clave-temporal";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import {
  ErrorDominio,
  agregarDominio as agregarDominioNucleo,
  marcarPrincipal as marcarPrincipalNucleo,
  quitarDominio as quitarDominioNucleo,
  verificarDominio as verificarDominioNucleo,
} from "@/nucleo/dominios";
import { bandaCreada } from "@/nucleo/cuenta";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin, type TxAdmin } from "./db";
import { type Direccion, POR_PAGINA, contiene, desde, paginado } from "./listado";

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
  /** "staff" o "autogestion" (se dio de alta sola). */
  origen: string;
};

export const ESTADOS_BANDA: EstadoTenant[] = ["ACTIVO", "MOROSO", "SUSPENDIDO", "ARCHIVADO"];
export const ORDENES_BANDA = ["alta", "nombre", "espacio"] as const;
export type FiltroBandas = {
  /** Contiene, en el nombre o el slug. */
  buscar?: string;
  estado?: EstadoTenant;
  origen?: "staff" | "autogestion";
  orden: { columna: (typeof ORDENES_BANDA)[number]; direccion: Direccion };
  pagina: number;
};

const COLUMNA_BANDA = { alta: Prisma.sql`t."creadoEn"`, nombre: Prisma.sql`t.nombre`, espacio: Prisma.sql`usado` };

/**
 * Una página de bandas, con su estado, módulos prendidos y espacio usado. Filtra, ordena
 * (también por espacio, que es una suma de `archivo`) y pagina en la base.
 */
export async function listarBandas(f: FiltroBandas): Promise<{ filas: FilaBanda[]; pagina: number; paginas: number; total: number }> {
  const db = dbAdmin();
  const condiciones = [Prisma.sql`TRUE`];
  if (f.estado) condiciones.push(Prisma.sql`t.estado = ${f.estado}::"EstadoTenant"`);
  if (f.origen) condiciones.push(Prisma.sql`t.origen = ${f.origen}`);
  if (f.buscar) condiciones.push(Prisma.sql`(t.nombre ILIKE ${contiene(f.buscar)} OR t.slug ILIKE ${contiene(f.buscar)})`);
  const donde = Prisma.join(condiciones, " AND ");

  const [{ total }] = await db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "tenant" t WHERE ${donde}`;
  const p = paginado(Number(total), f.pagina);
  const direccion = f.orden.direccion === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const pagina = await db.$queryRaw<{ id: string; usado: bigint }[]>`
    SELECT t.id, COALESCE(u.usado, 0)::bigint AS usado
    FROM "tenant" t
    LEFT JOIN (SELECT "tenantId", sum(bytes) AS usado FROM "archivo" GROUP BY "tenantId") u ON u."tenantId" = t.id
    WHERE ${donde}
    ORDER BY ${COLUMNA_BANDA[f.orden.columna]} ${direccion}, t.id ${direccion}
    LIMIT ${POR_PAGINA} OFFSET ${desde(p.pagina)}`;

  const bandas = await db.tenant.findMany({
    where: { id: { in: pagina.map((b) => b.id) } },
    include: { dominios: { where: { esPrincipal: true }, select: { dominio: true } }, modulos: { select: { moduloId: true } } },
  });
  const porId = new Map(bandas.map((b) => [b.id, b]));
  const filas = pagina.flatMap(({ id, usado }) => {
    const b = porId.get(id);
    if (!b) return []; // borrada entre las dos consultas
    return [
      {
        id: b.id,
        nombre: b.nombre,
        slug: b.slug,
        estado: b.estado,
        dominio: b.dominios[0]?.dominio ?? null,
        modulos: b.modulos.map((m) => m.moduloId).sort(),
        usado,
        limite: b.limiteAlmacenamiento,
        creadoEn: b.creadoEn,
        origen: b.origen,
      },
    ];
  });
  return { filas, ...p };
}

/** Subdominios que son de la plataforma, no de una banda. */


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
    const problema = problemaDeSubdominio(valor, que);
    if (problema) throw new ErrorFormulario(problema);
  }
  const dominio = `${sub}.${dominioRaiz()}`;
  const email = datos.titularEmail.toLowerCase();

  const db = dbAdmin();
  let alta: { tenantId: string; slug: string; dominio: string; titular: string; claveTemporal: string | null };
  try {
    alta = await db.$transaction(async (tx) => {
      if (await tx.tenant.findUnique({ where: { slug } })) throw new ErrorFormulario(`Ya existe una banda con el slug "${slug}".`);
      if (await tx.dominio.findFirst({ where: { dominio } })) throw new ErrorFormulario(`El dominio ${dominio} ya está en uso.`);

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
  // La banda ya existe: el gestor de cuenta (si hay) arranca su plan o su prueba. Si falla, la
  // banda queda igual creada (el staff le asigna el plan a mano) y el error, en el log.
  await bandaCreada(alta.tenantId, "staff").catch((e) => console.error(`[alta] gestor de cuenta para ${alta.slug}:`, e));
  return alta;
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
  const orden = registro().roles.map((r) => r.clave);
  banda.membresias.sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol) || a.usuario.email.localeCompare(b.usuario.email));
  return banda;
}

/** Cambia el estado. ARCHIVADO apaga panel y sitio: exige confirmación explícita. */
export async function cambiarEstado(staffId: string, tenantId: string, estado: string, confirmado: boolean) {
  if (!ESTADOS_BANDA.includes(estado as EstadoTenant)) throw new ErrorFormulario("Elegí un estado.");
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

/** Errores del núcleo de dominios → mensaje del formulario. */
async function dominios<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorDominio) throw new ErrorFormulario(e.message);
    throw e;
  }
}

/** Registra un dominio propio, sin verificar (no resuelve hasta verificarlo). */
export async function agregarDominio(staffId: string, tenantId: string, dominio: string, via: "cname" | "zona" = "cname") {
  return dominios(() => agregarDominioNucleo(staffId, tenantId, dominio, via));
}

/** Consulta a Cloudflare y al DNS, y lo verifica si los registros están. */
export async function verificarDominio(staffId: string, tenantId: string, dominioId: string) {
  return dominios(() => verificarDominioNucleo(staffId, tenantId, dominioId));
}

/** Quita un dominio propio (confirmado; nunca el principal ni el subdominio). */
export async function quitarDominio(staffId: string, tenantId: string, dominioId: string, confirmado: boolean) {
  return dominios(() => quitarDominioNucleo(staffId, tenantId, dominioId, confirmado));
}

/** Marca el dominio principal de la banda (hay uno solo, verificado y con certificado). */
export async function marcarPrincipal(staffId: string, tenantId: string, dominioId: string) {
  return dominios(() => marcarPrincipalNucleo(staffId, tenantId, dominioId));
}

// ── miembros ───────────────────────────────────────────────────────────────

/** Un rol que existe: del núcleo o declarado por un módulo de este build. */
function rolValido(rol: string): string {
  if (!registro().rol(rol)) throw new ErrorFormulario("Elegí un rol.");
  return rol;
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
