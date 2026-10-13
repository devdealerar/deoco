// Hosts de la plataforma. DEOCO_DOMINIO_RAIZ: "deoco.com" en producción,
// "lvh.me" en desarrollo (todo *.lvh.me apunta a 127.0.0.1, sin tocar /etc/hosts).

export function dominioRaiz(): string {
  return (process.env.DEOCO_DOMINIO_RAIZ ?? "deoco.com").toLowerCase();
}

/** Host del pedido sin puerto ni punto final, en minúsculas. */
export function normalizarHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** `app.<raiz>`: el panel de la plataforma. No resuelve a ningún tenant. */
export function esHostPlataforma(host: string): boolean {
  return host === `app.${dominioRaiz()}`;
}

/** `https://app.<raiz>` en producción; `http://app.<raiz>:<puerto>` en desarrollo. Para links absolutos. */
export function origenPlataforma(): string {
  return process.env.NODE_ENV === "production"
    ? `https://app.${dominioRaiz()}`
    : `http://app.${dominioRaiz()}:${process.env.PORT ?? 3000}`;
}
