// Llevarse un dominio comprado en Deoco a otro registrador (docs/diseno-dominios.md §3.2, D11). Sin
// staff: la banda pide el código desde el panel, Deoco desbloquea el dominio y se lo muestra. No se
// tocan los nameservers: el sitio y el correo siguen andando durante la transferencia. Cuando el
// dominio deja de estar en la subcuenta, el barrido lo detecta y pasa a ser un delegado más (renueva
// la banda; si quiere, después se lleva también el DNS).
//
// El código NO va por mail ni queda guardado (un mail queda 90 días en la tabla `correo`): se
// muestra en el panel, solo al titular, cada vez que lo pide. El mail avisa que se pidió.
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
import { ErrorDominio } from "./index";
import { transferibleDesde } from "./plazos";
import { ErrorRegistrador, registrador } from "./registrador";


const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });

/** Desde cuándo se puede llevar (null: ya se puede). */
export async function puedeTransferirDesde(tenantId: string, dominio: string, ahora = new Date()): Promise<Date | null> {
  const ultima = await conTenant(tenantId, (tx) =>
    tx.dominioCompra.findFirst({ where: { dominio, tipo: { in: ["alta", "titular"] }, estado: "listo" }, orderBy: { terminadoEn: "desc" }, select: { terminadoEn: true } }),
  );
  if (!ultima?.terminadoEn) return null;
  const desde = transferibleDesde(ultima.terminadoEn);
  return desde > ahora ? desde : null;
}

/** "Llevármelo": desbloquea el dominio y devuelve el código de transferencia (para mostrar, no se guarda). */
export async function pedirCodigoDeTransferencia(usuarioId: string, tenantId: string, dominioId: string): Promise<{ dominio: string; codigo: string }> {
  const r = registrador();
  if (!r) throw new ErrorDominio("La compra de dominios no está habilitada en este servidor: escribinos.");
  const d = await conTenant(tenantId, (tx) => tx.dominio.findUnique({ where: { id: dominioId } }));
  if (!d?.comprado) throw new ErrorDominio("Ese dominio no está registrado en Deoco: ya es tuyo en tu registrador.");
  if (d.vencidoEn) throw new ErrorDominio(`${d.dominio} está vencido: renovalo primero (después lo podés llevar).`);
  const desde = await puedeTransferirDesde(tenantId, d.dominio);
  if (desde) throw new ErrorDominio(`Por las reglas del registro, ${d.dominio} se puede llevar a otro registrador desde el ${fecha(desde)} (60 días después de registrarlo o de cambiar el titular).`);
  const cliente = await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: r.nombre } }));
  if (!cliente) throw new ErrorDominio(`No encontramos la cuenta de ${d.dominio} en el registrador: escribinos.`);
  let codigo: string;
  try {
    ({ codigo } = await r.desbloquearYCodigo(cliente.clienteId, d.dominio));
  } catch (e) {
    if (e instanceof ErrorRegistrador) throw new ErrorDominio(`El registrador no nos dio el código ahora (${e.message}). Probá de nuevo en un rato.`);
    throw e;
  }
  const primera = !d.transferenciaPedidaEn;
  await conTenant(tenantId, async (tx) => {
    await tx.dominio.update({ where: { id: d.id }, data: { transferenciaPedidaEn: d.transferenciaPedidaEn ?? new Date() } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "dominio.codigo_transferencia", detalle: { dominio: d.dominio } } });
  });
  if (primera) {
    await avisarAlTitular(tenantId, {
      clave: `dominio-codigo:${d.dominio}:${new Date().toISOString().slice(0, 10)}`,
      asunto: () => `Pediste el código para llevarte ${d.dominio}`,
      parrafos: () => [
        `Desde el panel se pidió el código de transferencia de ${d.dominio}. El código está en Dominios (no lo mandamos por mail).`,
        "Cargalo en tu registrador nuevo. Mientras se transfiere, el sitio y el correo siguen andando: no se toca nada. Cuando termine, el dominio queda en tu registrador nuevo y lo seguís usando en Deoco si querés.",
        "Si no fuiste vos, escribinos.",
      ],
      boton: { texto: "Ver Dominios", ruta: "/dominios" },
    }).catch((e) => console.error(`[transferencia] aviso de ${d.dominio}:`, e));
  }
  return { dominio: d.dominio, codigo };
}

/**
 * Barrido: los comprados con la transferencia pedida que ya no están en la subcuenta se fueron.
 * Pasan a delegados (la zona sigue: nada se corta) y la banda los renueva en su registrador nuevo.
 */
export async function revisarTransferencias(): Promise<number> {
  const r = registrador();
  if (!r) return 0;
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_vencimientos(${new Date(0)}::timestamp) AS b`;
  let idas = 0;
  for (const { id: tenantId } of bandas) {
    try {
      const filas = await conTenant(tenantId, (tx) => tx.dominio.findMany({ where: { comprado: true, transferenciaPedidaEn: { not: null }, NOT: { dominio: { startsWith: "www." } } } }));
      if (!filas.length) continue;
      const cliente = await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: r.nombre } }));
      if (!cliente) continue;
      for (const d of filas) {
        if (await r.dominio(cliente.clienteId, d.dominio)) continue;
        await conTenant(tenantId, async (tx) => {
          // El dominio y su www: ahora delegados (renueva la banda, la fecha la carga ella).
          await tx.dominio.updateMany({ where: { dominio: { in: [d.dominio, `www.${d.dominio}`] } }, data: { comprado: false, transferenciaPedidaEn: null, venceEn: null, vencidoEn: null } });
          await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.transferido_afuera", detalle: { dominio: d.dominio } } });
        });
        await avisarAlTitular(tenantId, {
          clave: `dominio-transferido:${d.dominio}`,
          asunto: () => `${d.dominio} ya está en tu registrador nuevo`,
          parrafos: () => [
            `La transferencia de ${d.dominio} terminó: ahora lo renovás en tu registrador nuevo (cargá la fecha de vencimiento en Dominios y te avisamos antes).`,
            "En Deoco sigue igual: el sitio y el correo andan como siempre, porque los nameservers no cambiaron. Si un día querés llevarte también el DNS, está en Dominios → Cómo me lo llevo.",
          ],
          boton: { texto: "Ver Dominios", ruta: "/dominios" },
        }).catch((e) => console.error(`[transferencia] aviso de ${d.dominio}:`, e));
        idas++;
      }
    } catch (e) {
      console.error(`[transferencia] ${tenantId}:`, e);
    }
  }
  return idas;
}
