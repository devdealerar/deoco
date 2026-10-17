// Módulo fans: la base de contactos de cada banda y su newsletter (D4). La base es de la banda:
// nunca se mezcla con la de otra (tampoco en la vista del manager) y se va entera en la
// exportación. Newsletter: doble confirmación, baja en un clic, prueba del consentimiento, cupo
// diario por la reputación del remitente.
import { conTenant } from "@/nucleo/db/con-tenant";
import { consultar } from "@/nucleo/consultas";
import type { Evento, Modulo } from "@/nucleo/modulos/contrato";
import { avisoAbierto, avisoBaja } from "./aviso";
import { sumarComprador, textoConsentimiento, type Comprador } from "./contactos";
import { buscarDatosFans, suprimirDatosFans } from "./datos-personales";
import { enviarTandas } from "./envios";
import { EnvioPanel, EnviosPanel, FansPanel } from "./panel/paginas";
import { BajaPublica, ConfirmarPublica, NovedadesPublica } from "./publico/paginas";

const VER = "fans.contactos.ver";
const ENVIOS = "fans.envios.ver";
const EDITAR = "fans.envios.editar";

/** La respuesta de la consulta "comprador" de la tienda o la ticketera (la forma la valida quien pregunta). */
function leerComprador(r: unknown): Comprador | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  if (!s("clave") || !s("email") || !s("fecha")) return null;
  return { clave: s("clave"), email: s("email"), nombre: s("nombre"), ciudad: s("ciudad"), provincia: s("provincia"), novedades: o.novedades === true, fecha: s("fecha") };
}

/** Una compra pagada suma al comprador a la base. Idempotente (por la clave de la compra). */
function alPagarse(origen: "tienda" | "ticketera", consulta: string, campo: string) {
  return async (e: Evento) => {
    const id = (e.payload as Record<string, unknown> | null)?.[campo];
    if (typeof id !== "string") return;
    const comprador = await consultar(e.tenantId, consulta, { [campo]: id }, { vacio: null, interpretar: leerComprador });
    if (comprador) await sumarComprador(e.tenantId, origen, comprador);
  };
}

const fans: Modulo = {
  id: "fans",
  nombre: "Fans y newsletter",
  permisos: [
    // La base tiene datos personales: solo el titular (y el gestor). Ante la duda, menos gente.
    { clave: VER, rolesPorDefecto: ["TITULAR"] },
    // Los envíos y sus números (sin datos de nadie).
    { clave: ENVIOS, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "LECTURA"] },
    { clave: EDITAR, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
  ],
  edicion: { permiso: EDITAR, ruta: "/fans/envios", sinPermiso: "Tu rol no puede escribir ni mandar newsletters." },
  rutasPanel: [
    { ruta: "/fans", permiso: VER, componente: FansPanel },
    { ruta: "/fans/envios", permiso: ENVIOS, componente: EnviosPanel },
    { ruta: "/fans/envios/[id]", permiso: ENVIOS, componente: EnvioPanel },
  ],
  rutasPublicas: [
    { ruta: "/novedades", componente: NovedadesPublica, metadatos: () => ({ titulo: "Novedades" }) },
    { ruta: "/novedades/confirmar", componente: ConfirmarPublica, metadatos: () => ({ titulo: "Novedades" }) },
    // La baja sigue aunque la banda esté cerrada: nadie tiene que quedar recibiendo mails.
    { ruta: "/novedades/baja", componente: BajaPublica, metadatos: () => ({ titulo: "Novedades" }), conBandaCerrada: async () => true },
  ],
  navegacion: [
    { etiqueta: "Fans", href: "/fans", permiso: VER, orden: 40 },
    { etiqueta: "Newsletter", href: "/fans/envios", permiso: ENVIOS, orden: 41 },
    { etiqueta: "Novedades", href: "/novedades", publica: true, orden: 60 },
  ],
  avisos: [
    { ruta: "/abierto/[entrega]", metodos: ["GET"], manejador: avisoAbierto },
    { ruta: "/baja/[entrega]", metodos: ["POST", "GET"], manejador: avisoBaja },
  ],
  eventosEscucha: [
    { evento: "pedido.pagado", manejador: alPagarse("tienda", "tienda.comprador", "pedidoId") },
    { evento: "compra.pagada", manejador: alPagarse("ticketera", "ticketera.comprador", "compraId") },
  ],
  // Para la tienda y la ticketera: si está, muestran la casilla (sin marcar) con este texto.
  consultas: [
    // Para el manager (D7): cuántos, nunca quiénes (3.2 manager d1: las bases no se unifican).
    {
      nombre: "resumen",
      responder: async (tenantId) =>
        conTenant(tenantId, async (tx) => ({ contactos: await tx.fansContacto.count(), suscriptos: await tx.fansContacto.count({ where: { newsletter: "confirmado" } }) })),
    },
    {
      nombre: "suscripcion",
      responder: async (tenantId) => ({
        texto: textoConsentimiento((await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } }))).nombre),
      }),
    },
  ],
  tareasPeriodicas: [{ nombre: "newsletter", cadaSegundos: 60, correr: enviarTandas }],
  mediciones: [
    { clave: "fans.contactos", etiqueta: "Contactos en la base", medir: (t) => conTenant(t, (tx) => tx.fansContacto.count()) },
    { clave: "fans.suscriptos", etiqueta: "Suscriptos al newsletter", medir: (t) => conTenant(t, (tx) => tx.fansContacto.count({ where: { newsletter: "confirmado" } })) },
  ],
  datosPersonales: {
    buscar: buscarDatosFans,
    suprimir: suprimirDatosFans,
    queRecolecta:
      "Si te suscribís a las novedades: tu email (obligatorio) y tu nombre (opcional), para mandarte el newsletter; se guarda cuándo lo pediste y lo confirmaste. De cada newsletter, si lo abriste (la primera vez, sin tu IP ni tu navegador) y si te diste de baja. Si comprás, tu nombre, email, ciudad y provincia quedan en la base de la banda con la cantidad de compras.",
    terminos: {
      titulo: "Newsletter",
      texto: "La suscripción es voluntaria y se confirma por mail. Te podés dar de baja cuando quieras, con un clic, desde cualquier newsletter o desde \"Tus datos personales\".",
    },
  },
};

export default fans;
