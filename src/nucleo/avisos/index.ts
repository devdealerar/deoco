// Avisos externos (webhooks de pasarelas). Llegan a la plataforma, no al host de la banda:
//   app.<raiz>/avisos/<tenantId>/<moduloId><ruta del aviso>
// Así no dependen del dominio propio de cada banda. El núcleo resuelve la banda y el
// módulo; la firma la verifica el módulo (es el que conoce la pasarela).
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { AvisoEntrante, Modulo, RespuestaAviso } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { origenPlataforma } from "@/nucleo/tenant/hosts";

/** Un aviso no es una subida de archivos: con 1 MB alcanza y sobra. */
export const LIMITE_CUERPO = 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (estado: number, cuerpo: string, extra: HeadersInit = {}) =>
  new Response(cuerpo, { status: estado, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra } });

/** Segmento de la URL de los avisos que no son de una banda: app.<raiz>/avisos/plataforma/<modulo>… */
export const PLATAFORMA = "plataforma";

/** URL de un aviso de plataforma (el gestor de cuenta la configura en la pasarela de Deoco). */
export function urlAvisoPlataforma(modulo: Pick<Modulo, "id">, ruta: string): string {
  return `${origenPlataforma()}/avisos/${PLATAFORMA}/${modulo.id}${ruta}`;
}

/** URL absoluta que el módulo le da a la pasarela (p. ej. `notification_url`). */
export function urlAviso(tenantId: string, modulo: Pick<Modulo, "id">, ruta: string): string {
  return `${origenPlataforma()}/avisos/${tenantId}/${modulo.id}${ruta}`;
}

async function leerCuerpo(request: Request): Promise<Uint8Array | null> {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_CUERPO) return null;
  if (!request.body) return new Uint8Array();
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = request.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > LIMITE_CUERPO) {
      await lector.cancel();
      return null;
    }
    partes.push(value);
  }
  return new Uint8Array(Buffer.concat(partes));
}

/**
 * Atiende un aviso. 404 si la banda no existe o el módulo no declara esa ruta; 405 si el método
 * no está declarado; 413 si el cuerpo pasa de 1 MB; 500 si el manejador falla (la pasarela
 * reintenta).
 *
 * Se atiende AUNQUE la banda esté archivada o tenga el módulo apagado: un aviso es plata que ya
 * se movió (un pago, una devolución, un contracargo) y tiene que quedar registrada. Que el
 * módulo decida qué hacer con eso (p. ej. marcar para devolución lo que llegó tarde).
 */
export async function atenderAviso(
  request: Request,
  donde: { tenantId: string; moduloId: string; path: string },
  reg: Registro = registroGlobal(),
): Promise<Response> {
  const { tenantId, moduloId, path } = donde;
  if (!UUID.test(tenantId)) return texto(404, "No encontrado");
  const encontrado = reg.modulo(moduloId) ? reg.aviso(moduloId, path) : undefined;
  if (!encontrado) return texto(404, "No encontrado");

  const tenant = await conTenant(tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }));
  if (!tenant) return texto(404, "No encontrado");

  return ejecutar(request, encontrado, (aviso) => encontrado.definicion.manejador({ ...aviso, tenantId }), `${moduloId}${path} de la banda ${tenantId}`);
}

type Comun = Omit<AvisoEntrante, "tenantId">;

/** Método, cuerpo (con límite) y respuesta: lo mismo para los avisos de banda y de plataforma. */
async function ejecutar(
  request: Request,
  encontrado: { definicion: { metodos?: ("GET" | "POST")[] }; params: Record<string, string> },
  manejar: (aviso: Comun) => Promise<RespuestaAviso | void>,
  donde: string,
): Promise<Response> {
  const { definicion, params } = encontrado;
  const metodo = request.method.toUpperCase();
  const metodos = definicion.metodos ?? ["POST"];
  if (!(metodos as string[]).includes(metodo)) return texto(405, "Método no permitido", { allow: metodos.join(", ") });

  const cuerpo = metodo === "POST" ? await leerCuerpo(request) : new Uint8Array();
  if (!cuerpo) return texto(413, "Cuerpo demasiado grande");

  const decodificado = () => new TextDecoder().decode(cuerpo);
  const aviso: Comun = {
    metodo: metodo as AvisoEntrante["metodo"],
    params,
    consulta: new URL(request.url).searchParams,
    cabeceras: request.headers,
    cuerpo,
    texto: decodificado,
    json: () => {
      try {
        return JSON.parse(decodificado());
      } catch {
        return null;
      }
    },
  };

  try {
    const r = (await manejar(aviso)) ?? {};
    const estado = r.estado ?? 200;
    if (r.cuerpo !== undefined && typeof r.cuerpo !== "string") {
      return Response.json(r.cuerpo, { status: estado, headers: { "cache-control": "no-store" } });
    }
    return texto(estado, r.cuerpo ?? "ok");
  } catch (e) {
    // Solo el mensaje: ni el cuerpo ni las cabeceras (pueden traer firmas o datos de pago).
    console.error(`[deoco] aviso ${donde} falló: ${e instanceof Error ? e.message : e}`);
    return texto(500, "Error");
  }
}

/**
 * Aviso de plataforma (no es de una banda): solo los que declara el gestor de cuenta en
 * `avisosPlataforma`. El manejador resuelve la banda y verifica la firma.
 */
export async function atenderAvisoPlataforma(
  request: Request,
  donde: { moduloId: string; path: string },
  reg: Registro = registroGlobal(),
): Promise<Response> {
  const encontrado = reg.modulo(donde.moduloId) ? reg.avisoPlataforma(donde.moduloId, donde.path) : undefined;
  if (!encontrado) return texto(404, "No encontrado");
  return ejecutar(request, encontrado, (aviso) => encontrado.definicion.manejador(aviso), `de plataforma ${donde.moduloId}${donde.path}`);
}
