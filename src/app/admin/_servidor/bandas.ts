import { randomInt } from "node:crypto";
import { Prisma, type EstadoTenant } from "@/generated/prisma/client";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin } from "./db";

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
const RESERVADOS = ["app", "www", "admin", "api", "mail", "static", "assets", "deoco"];

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
          data: { email, nombre: datos.titularNombre, hashContrasena: await hashearContrasena(clave) },
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
