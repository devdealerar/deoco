// La IP de quien hace el pedido. Solo para frenar abusos (nunca para autorizar nada).
//
// En producción todo pasa por Cloudflare (docs/diseno-dominios.md §1): Traefik ve la IP de
// Cloudflare y la pone en x-forwarded-for, así que la del visitante viene en CF-Connecting-IP.
// Es confiable porque el origen solo acepta conexiones de Cloudflare (Authenticated Origin
// Pulls). Sin Cloudflare (desarrollo, o la vuelta atrás a nube gris), queda x-forwarded-for.

/** La IP del visitante según las cabeceras del pedido, o null si no se sabe. */
export function ipDelVisitante(h: Pick<Headers, "get">): string | null {
  return h.get("cf-connecting-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")?.trim() || null;
}
