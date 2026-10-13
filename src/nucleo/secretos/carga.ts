// Secretos por banda: carga y listado para la pantalla del titular. Solo el núcleo.
// Nunca devuelve un valor: a la pantalla llega si está cargado y una pista.
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { cifrar, ErrorSecreto, pistaDe } from "./cifrado";
import { contextoSecreto, moduloDueno } from "./index";

const LARGO_MAXIMO = 4096;

export type SecretoEnPantalla = {
  moduloId: string;
  moduloNombre: string;
  clave: string;
  etiqueta: string;
  ayuda?: string;
  cargado: boolean;
  pista: string;
  actualizadoEn: Date | null;
};

/** Los secretos que declaran los módulos prendidos de la banda, con su estado. */
export async function secretosDeBanda(tenantId: string, reg: Registro = registroGlobal()): Promise<SecretoEnPantalla[]> {
  const prendidos = await modulosPrendidos(tenantId, reg);
  const filas = await conTenant(tenantId, (tx) =>
    tx.secreto.findMany({ select: { moduloId: true, clave: true, pista: true, actualizadoEn: true } }),
  );
  return reg.modulos
    .filter((m) => prendidos.has(m.id))
    .flatMap((m) =>
      (m.secretos ?? []).map((s) => {
        const fila = filas.find((f) => f.moduloId === m.id && f.clave === s.clave);
        return {
          moduloId: m.id,
          moduloNombre: m.nombre,
          clave: s.clave,
          etiqueta: s.etiqueta,
          ayuda: s.ayuda,
          cargado: !!fila,
          pista: fila?.pista ?? "",
          actualizadoEn: fila?.actualizadoEn ?? null,
        };
      }),
    );
}

/** Solo el titular (el staff no: es una credencial de cobro de la banda). */
async function exigirTitular(usuarioId: string, tenantId: string) {
  const acceso = await resolverAcceso(usuarioId, tenantId);
  if (acceso?.rol !== "TITULAR") throw new ErrorSecreto("Solo el titular de la banda carga credenciales.");
}

function declarado(moduloId: string, clave: string, reg: Registro) {
  const modulo = reg.modulo(moduloId);
  if (!modulo) throw new ErrorSecreto(`No existe el módulo "${moduloId}".`);
  return { modulo, def: moduloDueno(modulo, clave, reg) };
}

export async function guardarSecreto(
  usuarioId: string,
  tenantId: string,
  moduloId: string,
  clave: string,
  valorCrudo: string,
  reg: Registro = registroGlobal(),
): Promise<void> {
  const { def } = declarado(moduloId, clave, reg);
  await exigirTitular(usuarioId, tenantId);
  if (!(await modulosPrendidos(tenantId, reg)).has(moduloId)) throw new ErrorSecreto("Ese módulo no está prendido para la banda.");
  const valor = valorCrudo.trim();
  if (!valor) throw new ErrorSecreto(`Falta el valor de "${def.etiqueta}".`);
  if (valor.length > LARGO_MAXIMO) throw new ErrorSecreto(`"${def.etiqueta}" es demasiado largo.`);
  const datos = {
    cifrado: cifrar(valor, contextoSecreto(tenantId, moduloId, clave)),
    pista: pistaDe(valor),
    actualizadoPor: usuarioId,
  };
  await conTenant(tenantId, async (tx) => {
    await tx.secreto.upsert({
      where: { tenantId_moduloId_clave: { tenantId, moduloId, clave } },
      create: { tenantId, moduloId, clave, ...datos },
      update: datos,
    });
    // La auditoría dice qué se cargó y quién, nunca el valor.
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "secreto.guardado", detalle: { modulo: moduloId, clave } } });
  });
}

export async function borrarSecreto(
  usuarioId: string,
  tenantId: string,
  moduloId: string,
  clave: string,
  reg: Registro = registroGlobal(),
): Promise<void> {
  declarado(moduloId, clave, reg);
  await exigirTitular(usuarioId, tenantId);
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.secreto.deleteMany({ where: { moduloId, clave } });
    if (count) {
      await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "secreto.borrado", detalle: { modulo: moduloId, clave } } });
    }
  });
}
