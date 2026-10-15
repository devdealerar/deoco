// Verificación de arranque en producción (la llama src/instrumentation.ts, una vez, antes
// de atender pedidos). Si algo falta o está mal configurado, el servidor NO levanta y el
// log dice exactamente qué: mejor eso que fallar en el primer pedido de una banda.
import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { generadoPara } from "@/generated/modulos";
import { prisma } from "@/nucleo/db/cliente";
import { registro } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { problemasDeCorreo } from "@/nucleo/correo/transporte";
import { problemasDeRegistrador } from "@/nucleo/dominios/registrador";
import { cuotaConfigurada } from "@/nucleo/pagos/cuota";
import { claveMaestra } from "@/nucleo/secretos/cifrado";

type Entorno = Record<string, string | undefined>;

function usuarioDe(url: string | undefined) {
  try {
    return url ? decodeURIComponent(new URL(url).username) : undefined;
  } catch {
    return undefined;
  }
}

/** Problemas de configuración que se ven sin tocar la base. */
export function problemasDeEntorno(env: Entorno, build: { generadoPara: string }): string[] {
  const p: string[] = [];
  for (const v of ["DATABASE_URL", "DATABASE_URL_ADMIN", "AUTH_SECRET", "DEOCO_DOMINIO_RAIZ"]) {
    if (!env[v]) p.push(`Falta la variable de entorno ${v}.`);
  }
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) {
    p.push("AUTH_SECRET es demasiado corto (mínimo 32 caracteres; generalo con `openssl rand -base64 32`).");
  }
  if (env.DEOCO_DOMINIO_RAIZ && /[:/]/.test(env.DEOCO_DOMINIO_RAIZ)) {
    p.push(`DEOCO_DOMINIO_RAIZ tiene que ser solo el dominio (p. ej. deocoartist.com), no "${env.DEOCO_DOMINIO_RAIZ}".`);
  }
  const app = usuarioDe(env.DATABASE_URL);
  const admin = usuarioDe(env.DATABASE_URL_ADMIN);
  const duena = usuarioDe(env.DATABASE_URL_MIGRACIONES);
  if (env.DATABASE_URL && !app) p.push("DATABASE_URL no es una URL de Postgres válida.");
  if (env.DATABASE_URL_ADMIN && !admin) p.push("DATABASE_URL_ADMIN no es una URL de Postgres válida.");
  if (app && admin && app === admin) p.push(`DATABASE_URL y DATABASE_URL_ADMIN usan el mismo rol (${app}): tienen que ser distintos.`);
  if (app && duena && app === duena) {
    p.push(`DATABASE_URL usa el rol dueño de las tablas (${app}): la app tiene que usar deoco_app, si no RLS no aísla a las bandas.`);
  }
  // Dominios propios (Cloudflare): las dos o ninguna (sin ellas, el panel dice que no están habilitados).
  if (Boolean(env.DEOCO_CLOUDFLARE_TOKEN?.trim()) !== Boolean(env.DEOCO_CLOUDFLARE_ZONA?.trim())) {
    p.push("Para los dominios propios hacen falta las dos variables: DEOCO_CLOUDFLARE_TOKEN y DEOCO_CLOUDFLARE_ZONA (id de la zona de DEOCO_DOMINIO_RAIZ).");
  } else if (env.DEOCO_CLOUDFLARE_TOKEN?.trim()) {
    // Delegar: las zonas se crean en la cuenta y sus registros apuntan al VPS.
    if (!env.DEOCO_CLOUDFLARE_CUENTA?.trim()) p.push("Con Cloudflare configurado falta DEOCO_CLOUDFLARE_CUENTA (id de la cuenta, para crear las zonas de los dominios delegados).");
    if (!env.DEOCO_IP_PUBLICA?.trim()) p.push("Con Cloudflare configurado falta DEOCO_IP_PUBLICA (la IP del VPS, a la que apuntan los dominios delegados).");
    // Correo desde el dominio de las bandas: el reenvío (Email Worker) lee los destinos del KV.
    if (env.DEOCO_RESEND_TOKEN?.trim() && !env.DEOCO_CLOUDFLARE_KV?.trim()) {
      p.push("Con DEOCO_RESEND_TOKEN y Cloudflare falta DEOCO_CLOUDFLARE_KV (el namespace de KV del reenvío de correo).");
    }
  }
  // Vender dominios: el registrador bien configurado, y Cloudflare (un dominio comprado vive en una zona nuestra).
  p.push(...problemasDeRegistrador(env));
  if (env.DEOCO_REGISTRADOR?.trim() && !env.DEOCO_CLOUDFLARE_TOKEN?.trim()) {
    p.push("DEOCO_REGISTRADOR necesita Cloudflare configurado (DEOCO_CLOUDFLARE_*): un dominio comprado vive en una zona de Deoco.");
  }
  if (build.generadoPara !== "produccion") {
    p.push("La lista de módulos no es de producción (incluiría módulos de desarrollo): construí con `next build`.");
  }
  return p;
}

/** Problemas que solo se ven conectando a la base (con la conexión de la app). */
/** La clave de cifrado de secretos hace falta solo si algún módulo declara secretos. */
export function problemasDeSecretos(modulos: readonly Modulo[], env: Entorno): string[] {
  if (env.DEOCO_CLAVE_SECRETOS_ANTERIOR?.trim() && !claveMaestra(env, "DEOCO_CLAVE_SECRETOS_ANTERIOR")) {
    return ["DEOCO_CLAVE_SECRETOS_ANTERIOR (rotación) no es de 32 bytes en base64: es la clave vieja tal cual estaba."];
  }
  const usan = modulos.filter((m) => m.secretos?.length).map((m) => m.id);
  if (usan.length === 0 || claveMaestra(env)) return [];
  return [
    `Los módulos ${usan.join(", ")} guardan credenciales por banda y DEOCO_CLAVE_SECRETOS falta o no es de 32 bytes en base64 (\`openssl rand -base64 32\`).`,
  ];
}

export async function problemasDeBase(env: Entorno): Promise<string[]> {
  const p: string[] = [];
  let app: { usuario: string; rolsuper: boolean; rolbypassrls: boolean; tablas: number };
  try {
    [app] = await prisma.$queryRaw<typeof app[]>`
      SELECT current_user AS usuario, r.rolsuper, r.rolbypassrls,
             (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS tablas
      FROM pg_roles r WHERE r.rolname = current_user`;
  } catch (e) {
    return [`No se pudo conectar a la base con DATABASE_URL: ${e instanceof Error ? e.message.split("\n").at(-1) : e}`];
  }
  if (app.rolsuper || app.rolbypassrls) {
    p.push(`DATABASE_URL usa el rol ${app.usuario}, que saltea RLS: tiene que ser deoco_app.`);
  }
  if (app.tablas > 0) p.push(`DATABASE_URL usa el rol ${app.usuario}, dueño de tablas: tiene que ser deoco_app.`);
  const admin = usuarioDe(env.DATABASE_URL_ADMIN);
  if (admin) {
    const [r] = await prisma.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = ${admin}`;
    if (!r) p.push(`DATABASE_URL_ADMIN usa el rol ${admin}, que no existe (prisma/sql/crear-rol-admin.sql).`);
    else if (!r.rolbypassrls) p.push(`DATABASE_URL_ADMIN usa el rol ${admin}, sin BYPASSRLS: el back office no vería las bandas.`);
  }
  const [funcion] = await prisma.$queryRaw<{ existe: boolean }[]>`SELECT to_regproc('app_tenant_id') IS NOT NULL AS existe`;
  if (!funcion?.existe) p.push("La base no tiene las migraciones aplicadas (falta app_tenant_id): corré `prisma migrate deploy`.");
  return p;
}

async function problemasDeArchivos(env: Entorno): Promise<string[]> {
  const dir = path.resolve(/*turbopackIgnore: true*/ env.DEOCO_ARCHIVOS_DIR ?? ".archivos");
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return [];
  } catch {
    return [`No se puede escribir en DEOCO_ARCHIVOS_DIR (${dir}): montá el volumen y revisá sus permisos.`];
  }
}

export async function verificarArranque(env: Entorno = process.env) {
  const problemas = problemasDeEntorno(env, { generadoPara });
  try {
    problemas.push(...problemasDeSecretos(registro().modulos, env)); // registro() valida el contrato
  } catch (e) {
    problemas.push(`Registro de módulos inválido: ${e instanceof Error ? e.message : e}`);
  }
  problemas.push(...problemasDeCorreo(env));
  problemas.push(...(await problemasDeArchivos(env)));
  if (env.DATABASE_URL) problemas.push(...(await problemasDeBase(env)));
  if (problemas.length > 0) {
    throw new Error(`Deoco no puede arrancar:\n  - ${problemas.join("\n  - ")}`);
  }
  if (!env.DEOCO_CORREO) {
    console.warn("[deoco] correo sin configurar (DEOCO_CORREO): los correos quedan pendientes y no salen.");
  }
  const gestor = registro().gestor;
  if (gestor && !cuotaConfigurada(env)) {
    console.warn(`[deoco] cuota sin configurar (DEOCO_CUOTA_MP_TOKEN): "${gestor.moduloId}" no puede cobrar planes; las bandas no pueden pagar.`);
  }
  console.log(`[deoco] arranque verificado · módulos: ${registro().modulos.map((m) => m.id).join(", ") || "ninguno"}`);
}

/** Para instrumentation.ts: si la verificación falla, el proceso termina con el motivo. */
export async function verificarArranqueOSalir() {
  try {
    await verificarArranque();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1); // que el contenedor caiga a la vista, no que quede sirviendo errores
  }
}
