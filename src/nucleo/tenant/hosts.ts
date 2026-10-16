// Hosts de la plataforma. DEOCO_DOMINIO_RAIZ: el dominio de producción (deocoartist.com), o
// "lvh.me" en desarrollo (todo *.lvh.me apunta a 127.0.0.1, sin tocar /etc/hosts).
// El dominio sale SIEMPRE de la variable: no hay uno escrito en el código.

export function dominioRaiz(): string {
  const raiz = process.env.DEOCO_DOMINIO_RAIZ?.trim();
  if (!raiz) throw new Error("Falta la variable de entorno DEOCO_DOMINIO_RAIZ (el dominio de la plataforma).");
  return raiz.toLowerCase();
}

/** Host del pedido sin puerto ni punto final, en minúsculas. */
export function normalizarHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** `app.<raiz>`: el panel de la plataforma. No resuelve a ningún tenant. */
export function esHostPlataforma(host: string): boolean {
  return host === `app.${dominioRaiz()}`;
}

/** `<slug>.<raiz>`: el subdominio de una banda en la plataforma. */
export const subdominioDe = (slug: string) => `${slug}.${dominioRaiz()}`;

/** Un host de la plataforma (`<algo>.<raiz>`), no un dominio propio. */
export const esDominioDePlataforma = (host: string) => host === dominioRaiz() || host.endsWith(`.${dominioRaiz()}`);

/** `https://app.<raiz>` en producción; `http://app.<raiz>:<puerto>` en desarrollo. Para links absolutos. */
export function origenPlataforma(): string {
  return process.env.NODE_ENV === "production"
    ? `https://app.${dominioRaiz()}`
    : `http://app.${dominioRaiz()}:${process.env.PORT ?? 3000}`;
}

/** Un dominio de banda → `https://<dominio>` en producción; `http://<dominio>:<puerto>` en desarrollo. */
export function origenDeDominio(dominio: string): string {
  return process.env.NODE_ENV === "production" ? `https://${dominio}` : `http://${dominio}:${process.env.PORT ?? 3000}`;
}
