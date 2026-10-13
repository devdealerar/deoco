import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Next carga este archivo en cada `next dev` y `next build`, se llame como se llame
 * (npm run build, next build directo, Easypanel, Docker). Por eso el descubrimiento de
 * módulos corre acá: en el build de producción quedan afuera los módulos marcados
 * SOLO_DESARROLLO.md, sin depender de los hooks de npm.
 */
function descubrirModulos(produccion: boolean) {
  execFileSync(process.execPath, ["scripts/descubrir-modulos.mjs", ...(produccion ? ["--produccion"] : [])], {
    stdio: "inherit",
  });
}

export default function config(fase: string): NextConfig {
  if (fase === PHASE_PRODUCTION_BUILD) descubrirModulos(true);
  if (fase === PHASE_DEVELOPMENT_SERVER) descubrirModulos(false);

  return {
    experimental: {
      // forbidden() → 403
      authInterrupts: true,
      // Subidas de archivos por server action: hasta 25 MB por archivo (MAX_BYTES_ARCHIVO)
      // más el sobrante del multipart. El proxy también tiene que dejar pasar ese cuerpo.
      serverActions: { bodySizeLimit: "26mb" },
      proxyClientMaxBodySize: "26mb",
    },
    // Desarrollo con subdominios *.lvh.me (ver CLAUDE.md).
    allowedDevOrigins: ["*.lvh.me"],
  };
}
