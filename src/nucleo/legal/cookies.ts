// Consentimiento de cookies en el sitio de cada banda (D2). Hoy el sitio solo usa cookies
// necesarias (el carrito, el acceso a una compra); las de analítica y publicidad no existen
// todavía, pero el aviso pregunta por ellas para que, el día que se sumen, solo corran con un sí.
// Cada decisión queda registrada (qué, cuándo, qué versión del aviso), sin datos de la persona: un
// id al azar que vive en la cookie del sitio. Se puede cambiar o revocar desde el pie del sitio.
import { randomUUID } from "node:crypto";
import { conTenant } from "@/nucleo/db/con-tenant";
import { VERSION_COOKIES } from "./textos";

export const COOKIE_CONSENTIMIENTO = "deoco_cookies";

export type Consentimiento = { visitante: string; analitica: boolean; marketing: boolean; version: string };

/** Lee la cookie ("<visitante>.<a><m>.<version>"). null si no decidió o el aviso cambió de versión. */
export function leerConsentimiento(valor: string | undefined): Consentimiento | null {
  const m = /^([0-9a-f-]{36})\.([01])([01])\.([0-9-]{10})$/.exec(valor ?? "");
  if (!m || m[4] !== VERSION_COOKIES) return null;
  return { visitante: m[1], analitica: m[2] === "1", marketing: m[3] === "1", version: m[4] };
}

export const valorDeCookie = (c: Consentimiento) => `${c.visitante}.${c.analitica ? 1 : 0}${c.marketing ? 1 : 0}.${c.version}`;

/** Registra la decisión del visitante (una fila por decisión; la última manda). */
export async function registrarConsentimiento(tenantId: string, previo: string | undefined, d: { analitica: boolean; marketing: boolean }): Promise<Consentimiento> {
  const visitante = /^([0-9a-f-]{36})\./.exec(previo ?? "")?.[1] ?? randomUUID();
  const c: Consentimiento = { visitante, analitica: d.analitica, marketing: d.marketing, version: VERSION_COOKIES };
  await conTenant(tenantId, (tx) => tx.consentimientoCookies.create({ data: { tenantId, ...c } }));
  return c;
}

/** Cuántos visitantes decidieron y qué (para la banda): la última decisión de cada uno. */
export async function resumenDeConsentimientos(tenantId: string) {
  const filas = await conTenant(tenantId, (tx) =>
    tx.$queryRaw<{ analitica: boolean; marketing: boolean; n: bigint }[]>`
      SELECT analitica, marketing, count(*) AS n FROM (
        SELECT DISTINCT ON (visitante) analitica, marketing FROM consentimiento_cookies ORDER BY visitante, "creadoEn" DESC
      ) x GROUP BY analitica, marketing`,
  );
  return filas.map((f) => ({ analitica: f.analitica, marketing: f.marketing, visitantes: Number(f.n) }));
}
