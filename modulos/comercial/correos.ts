// Mails de la cuota al titular de la banda: cuando entra en mora y cuando se suspende el panel.
// Los manda Deoco (no la banda): remitente "Deoco". Cada uno con clave única por día, así un
// barrido repetido o un aviso duplicado no lo manda dos veces.
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
import { pasarelaDeLaCuota } from "@/nucleo/pagos/cuota";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { cuentaDe, plazos } from "./cuenta";
import comercial from "./index";

const estilo = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";
const dia = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: ZONA });

async function banda(tenantId: string) {
  return conTenant(tenantId, async (tx) => ({
    titular: await titularDeBanda(tx),
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true, slug: true } }),
  }));
}

async function mandar(tenantId: string, clave: string, asunto: (nombre: string) => string, parrafos: (nombre: string) => string[], boton: string) {
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
<p><a href="${h(url)}">${h(boton)}</a></p>
${responderA ? "<p>¿Dudas? Respondé este mail y te ayudamos.</p>" : ""}
</div>`,
      texto: [`Hola, ${titular.nombre}:`, "", ...lineas.flatMap((l) => [l, ""]), `${boton}: ${url}`, ...(responderA ? ["", "¿Dudas? Respondé este mail y te ayudamos."] : [])].join("\n"),
    },
    { unica: clave },
  );
}

/** La cuenta pasó a MOROSO: el sitio sigue online; el panel también, con el aviso de pago. */
export async function avisarMora(tenantId: string, motivo: "rechazado" | "vencida", ahora = new Date()) {
  const [cfg, cuenta] = await Promise.all([plazos(), cuentaDe(tenantId)]);
  const suspende = new Date((cuenta?.moraDesde ?? ahora).getTime() + cfg.diasMoraASuspender * 86_400_000);
  await mandar(
    tenantId,
    `cuota-mora:${dia(ahora)}`,
    (n) => `${n}: no pudimos cobrar la cuota de Deoco`,
    (n) => [
      motivo === "rechazado"
        ? `${pasarelaDeLaCuota().nombre} rechazó el cobro de la cuota mensual de ${n} en Deoco. Suele pasar cuando la tarjeta venció, no tiene fondos o el banco frenó el pago.`
        : `La cuota mensual de ${n} en Deoco venció y no recibimos el pago.`,
      "Por ahora no cambia nada: tu sitio sigue online y el panel funciona.",
      `Para que siga así, revisá tu forma de pago (o cargá otra) en Plan y pago antes del ${fecha(suspende)}. Si para esa fecha no se regulariza, el panel queda suspendido hasta que pagues; el sitio público sigue online y no se borra nada.`,
    ],
    "Revisar mi forma de pago",
  );
}

/** La cuenta pasó a SUSPENDIDO: panel bloqueado salvo el pago; el sitio público sigue online. */
export async function avisarSuspension(tenantId: string, causa: "prueba" | "mora", ahora = new Date()) {
  await mandar(
    tenantId,
    `cuota-suspension:${dia(ahora)}`,
    (n) => (causa === "prueba" ? `${n}: terminó tu prueba gratis en Deoco` : `${n}: suspendimos el panel de Deoco`),
    (n) => [
      causa === "prueba"
        ? `Terminó la prueba gratis de ${n} en Deoco y no hay una forma de pago cargada, así que el panel quedó en pausa.`
        : `La cuota de ${n} en Deoco sigue sin pagarse, así que el panel quedó en pausa.`,
      "Tu sitio público sigue online y no se borró nada: productos, shows, entradas vendidas y archivos están intactos.",
      causa === "prueba"
        ? "Para seguir, elegí un plan y cargá tu forma de pago en Plan y pago. Apenas se confirma, el panel vuelve a funcionar."
        : "Para volver a usarlo, regularizá el pago en Plan y pago. Apenas se acredita, el panel vuelve a funcionar.",
    ],
    causa === "prueba" ? "Elegir un plan" : "Ir a Plan y pago",
  );
}
