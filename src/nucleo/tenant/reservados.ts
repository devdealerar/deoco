// Subdominios (y slugs) que no puede tomar una banda: los usa o podría usar la plataforma, o
// se prestan a engañar ("soporte.deoco.com", "pagos.deoco.com"). Vale para el alta del staff y
// para la autogestión.
export const SUBDOMINIOS_RESERVADOS: readonly string[] = [
  "app", "www", "admin", "api", "mail", "correo", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "dns",
  "static", "assets", "cdn", "img", "media", "archivos", "descargas", "files",
  "deoco", "staff", "soporte", "ayuda", "help", "support", "contacto", "status", "estado",
  "blog", "docs", "documentacion", "dev", "test", "pruebas", "staging", "demo", "beta",
  "panel", "portal", "login", "ingresar", "registro", "cuenta", "cuentas", "clave", "seguridad",
  "pago", "pagos", "cobros", "facturacion", "billing", "checkout", "shop",
  "avisos", "webhooks", "auth", "oauth", "sso", "nueva", "nuevo", "root", "abuse", "postmaster", "hostmaster", "webmaster",
];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** null si sirve; si no, por qué (para mostrar). */
export function problemaDeSubdominio(valor: string, que = "El subdominio"): string | null {
  if (valor.length < 2 || valor.length > 40 || !SLUG.test(valor)) {
    return `${que} "${valor}" no sirve: usá solo minúsculas, números y guiones, de 2 a 40 caracteres (por ejemplo, los-satelites).`;
  }
  if (SUBDOMINIOS_RESERVADOS.includes(valor)) return `${que} "${valor}" está reservado. Probá con otro, por ejemplo el nombre de la banda.`;
  return null;
}
