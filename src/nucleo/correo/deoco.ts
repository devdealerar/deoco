// Avisos de Deoco al titular de una banda (dominios hoy; renovaciones y lo que venga después).
// Remitente "Deoco"; se responde a la casilla de Deoco (DEOCO_CUOTA_RESPONDER_A) si está.
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { enviarCorreoDelNucleo, escaparHtml as h } from "./index";

const ESTILO = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";

export type AvisoAlTitular = {
  /** Clave única en la banda: el mismo aviso no sale dos veces. */
  clave: string;
  asunto: (banda: string) => string;
  parrafos: (banda: string) => string[];
  /** Botón al panel de la banda: `ruta` dentro de `/b/<slug>` (p. ej. "/dominios"). */
  boton: { texto: string; ruta: string };
};

/**
 * Manda el aviso al titular de la banda. Sin titular, no hace nada. Con `tx` (de `conTenant` de
 * esa banda), el mail se encola en esa transacción: sale si y solo si lo demás se confirma.
 */
export async function avisarAlTitular(tenantId: string, aviso: AvisoAlTitular, opciones: { tx?: TxTenant } = {}): Promise<void> {
  const leer = async (tx: TxTenant) => ({
    titular: await titularDeBanda(tx),
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true, slug: true } }),
  });
  const datos = opciones.tx ? await leer(opciones.tx) : await conTenant(tenantId, leer);
  if (!datos.titular) return;
  const { titular, banda } = datos;
  const url = `${origenPlataforma()}/b/${banda.slug}${aviso.boton.ruta}`;
  const lineas = aviso.parrafos(banda.nombre);
  const responderA = process.env.DEOCO_CUOTA_RESPONDER_A?.trim() || undefined;
  const dudas = responderA ? ["¿Dudas? Respondé este mail y te ayudamos."] : [];
  await enviarCorreoDelNucleo(
    tenantId,
    {
      para: titular.email,
      nombreRemitente: "Deoco",
      // Sin casilla de Deoco, que no responda al propio titular: sin "responder a".
      responderA,
      asunto: aviso.asunto(banda.nombre),
      html: `<div style="${ESTILO}">
<p>Hola, ${h(titular.nombre)}:</p>
${lineas.map((l) => `<p>${h(l)}</p>`).join("\n")}
<p><a href="${h(url)}">${h(aviso.boton.texto)}</a></p>
${dudas.map((l) => `<p>${h(l)}</p>`).join("")}
</div>`,
      texto: [`Hola, ${titular.nombre}:`, "", ...lineas.flatMap((l) => [l, ""]), `${aviso.boton.texto}: ${url}`, ...dudas.flatMap((l) => ["", l])].join("\n"),
    },
    { unica: aviso.clave, ...(opciones.tx ? { tx: opciones.tx } : {}) },
  );
}
