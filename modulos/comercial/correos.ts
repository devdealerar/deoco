// Mails de la cuota al titular de la banda: cuando entra en mora y cuando se suspende el panel.
// Los manda Deoco (no la banda): remitente "Deoco". Cada uno con clave única por día, así un
// barrido repetido o un aviso duplicado no lo manda dos veces.
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import comercial from "./index";

const estilo = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";
const dia = (d: Date) => d.toISOString().slice(0, 10);

async function banda(tenantId: string) {
  return conTenant(tenantId, async (tx) => ({
    titular: await titularDeBanda(tx),
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true, slug: true } }),
  }));
}

async function mandar(tenantId: string, clave: string, asunto: (nombre: string) => string, parrafos: (nombre: string) => string[]) {
  const { titular, banda: b } = await banda(tenantId);
  if (!titular) return;
  const url = `${origenPlataforma()}/b/${b.slug}/pago`;
  const lineas = parrafos(b.nombre);
  // A quién le responde el titular: la casilla de Deoco si está configurada.
  const responderA = process.env.DEOCO_CUOTA_RESPONDER_A?.trim() || undefined;
  await enviarCorreo(
    comercial,
    tenantId,
    {
      para: titular.email,
      nombreRemitente: "Deoco",
      ...(responderA ? { responderA } : {}),
      asunto: asunto(b.nombre),
      html: `<div style="${estilo}">
<p>Hola, ${h(titular.nombre)}:</p>
${lineas.map((l) => `<p>${h(l)}</p>`).join("\n")}
<p><a href="${h(url)}">Ir a Plan y pago</a></p>
</div>`,
      texto: [`Hola, ${titular.nombre}:`, "", ...lineas.flatMap((l) => [l, ""]), `Plan y pago: ${url}`].join("\n"),
    },
    { unica: clave },
  );
}

/** La cuenta pasó a MOROSO: el sitio sigue online; el panel también, con el aviso de pago. */
export async function avisarMora(tenantId: string, motivo: "rechazado" | "vencida", ahora = new Date()) {
  await mandar(
    tenantId,
    `cuota-mora:${dia(ahora)}`,
    (n) => `${n}: no pudimos cobrar la cuota de Deoco`,
    (n) => [
      motivo === "rechazado"
        ? `El cobro de la cuota mensual de ${n} en Deoco fue rechazado.`
        : `La cuota mensual de ${n} en Deoco venció y no recibimos el pago.`,
      "Tu sitio sigue online y el panel funciona. Si no se regulariza en los próximos días, el panel queda suspendido (el sitio público sigue online y no se borra nada).",
      "Podés revisar tu forma de pago en Plan y pago.",
    ],
  );
}

/** La cuenta pasó a SUSPENDIDO: panel bloqueado salvo el pago; el sitio público sigue online. */
export async function avisarSuspension(tenantId: string, motivo: string, ahora = new Date()) {
  await mandar(
    tenantId,
    `cuota-suspension:${dia(ahora)}`,
    (n) => `${n}: el panel de Deoco quedó suspendido`,
    (n) => [
      `El panel de ${n} en Deoco quedó suspendido (${motivo}).`,
      "Tu sitio público sigue online y no se borró nada. Apenas se registre el pago, el panel vuelve a funcionar al instante.",
    ],
  );
}
