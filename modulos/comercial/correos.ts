// Mails del gestor al titular de la banda: la cuota (mora, suspensión) y los dominios (`mandar`).
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

export async function mandar(
  tenantId: string,
  clave: string,
  asunto: (nombre: string) => string,
  parrafos: (nombre: string) => string[],
  boton: string,
  ruta = "/pago",
) {
  const { titular, banda: b } = await banda(tenantId);
  if (!titular) return;
  const url = `${origenPlataforma()}/b/${b.slug}${ruta}`;
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

/** La cuenta pasó a MOROSO (aviso): todo sigue funcionando. Dice qué pasa y cuándo si no se paga. */
export async function avisarMora(tenantId: string, motivo: "rechazado" | "vencida" | "baja", ahora = new Date()) {
  const [cfg, cuenta] = await Promise.all([plazos(), cuentaDe(tenantId)]);
  const desde = (cuenta?.moraDesde ?? ahora).getTime();
  const enDias = (d: number) => fecha(new Date(desde + d * 86_400_000));
  await mandar(
    tenantId,
    `cuota-mora:${dia(ahora)}`,
    (n) => (motivo === "baja" ? `${n}: terminó el período que pagaste en Deoco` : `${n}: no pudimos cobrar la cuota de Deoco`),
    (n) => [
      motivo === "rechazado"
        ? `${pasarelaDeLaCuota().nombre} rechazó el cobro de la cuota mensual de ${n} en Deoco. Suele pasar cuando la tarjeta venció, no tiene fondos o el banco frenó el pago.`
        : motivo === "baja"
          ? `Diste de baja la suscripción de ${n} en Deoco y ya terminó el período que pagaste. No te vamos a cobrar nada.`
          : `La cuota mensual de ${n} en Deoco venció y no recibimos el pago.`,
      "Por ahora no cambia nada: tu sitio, tu tienda, tus entradas y el panel siguen funcionando.",
      `Si no se regulariza: desde el ${enDias(cfg.diasSoloLectura)} el panel queda en solo lectura (se ve todo, no se edita); desde el ${enDias(cfg.diasMoraASuspender)} el sitio deja de estar publicado y se cortan las ventas. Nunca se borra nada, y la puerta de los shows ya vendidos sigue funcionando.`,
      motivo === "baja" ? "Si querés seguir, elegí un plan en Plan y pago cuando quieras: todo vuelve como estaba." : "Revisá tu forma de pago (o cargá otra) en Plan y pago.",
    ],
    motivo === "baja" ? "Ir a Plan y pago" : "Revisar mi forma de pago",
  );
}

/** SOLO_LECTURA: el panel se ve pero no guarda; el sitio y las ventas siguen. */
export async function avisarSoloLectura(tenantId: string, causa: "prueba" | "mora" | "baja" = "mora", ahora = new Date()) {
  const [cfg, cuenta] = await Promise.all([plazos(), cuentaDe(tenantId)]);
  const corte = fecha(new Date((cuenta?.moraDesde ?? ahora).getTime() + cfg.diasMoraASuspender * 86_400_000));
  await mandar(
    tenantId,
    `cuota-lectura:${dia(ahora)}`,
    (n) => `${n}: tu panel de Deoco quedó en solo lectura`,
    (n) => [
      `${causa === "baja" ? `Diste de baja ${n} en Deoco y no elegiste un plan nuevo` : `La cuota de ${n} en Deoco sigue sin pagarse`}, así que el panel quedó en solo lectura: podés ver todo, pero no publicar, crear ni editar.`,
      "Tu sitio, tu tienda y la venta de entradas siguen funcionando: lo que vendas es tuyo.",
      `Si para el ${corte} no se regulariza, el sitio deja de estar publicado y se cortan las ventas. Apenas pagás, todo vuelve.`,
    ],
    "Ir a Plan y pago",
  );
}

/** SUSPENDIDO: sitio despublicado y ventas cortadas; la puerta de los shows vendidos sigue. */
export async function avisarSuspension(tenantId: string, causa: "prueba" | "mora" | "baja", ahora = new Date()) {
  await mandar(
    tenantId,
    `cuota-suspension:${dia(ahora)}`,
    (n) => `${n}: tu sitio dejó de estar publicado en Deoco`,
    (n) => [
      causa === "prueba"
        ? `Terminó la prueba gratis de ${n} en Deoco hace tiempo y no hay una forma de pago cargada.`
        : causa === "baja"
          ? `Diste de baja ${n} en Deoco y no elegiste un plan nuevo.`
          : `La cuota de ${n} en Deoco sigue sin pagarse.`,
      "Por eso el sitio dejó de estar publicado y se cortaron las ventas de la tienda y de entradas. No se borró nada: productos, shows, entradas vendidas y archivos están intactos, y la puerta de los shows que ya vendiste sigue funcionando hasta que terminen.",
      "Apenas pagás en Plan y pago, el sitio vuelve a publicarse tal como estaba y se reabren las ventas.",
    ],
    causa === "prueba" ? "Elegir un plan" : "Ir a Plan y pago",
  );
}

/** ARCHIVADO por la cuota: el sitio y el panel se van; los datos y los dominios siguen siendo de la banda. */
export async function avisarArchivo(tenantId: string, causa: "prueba" | "mora" | "baja" = "mora", ahora = new Date()) {
  await mandar(
    tenantId,
    `cuota-archivo:${dia(ahora)}`,
    (n) => `${n}: archivamos la banda en Deoco`,
    (n) => [
      causa === "baja"
        ? `Diste de baja ${n} en Deoco hace tiempo, así que archivamos la banda: el sitio y el panel dejan de estar disponibles.`
        : `La cuota de ${n} en Deoco lleva demasiado tiempo sin pagarse, así que archivamos la banda: el sitio y el panel dejan de estar disponibles.`,
      "No se borró nada. Tus dominios siguen siendo tuyos y podés llevártelos desde el panel. La puerta de los shows que ya vendiste sigue funcionando hasta que terminen.",
      "Para volver, entrá a Plan y pago y elegí un plan: apenas se cobra, todo vuelve como estaba.",
    ],
    "Ir a mis dominios",
    "/dominios",
  );
}
