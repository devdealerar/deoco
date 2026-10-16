// Los datos personales de un fan en la tienda (D2: derechos del fan, `datosPersonales` del
// contrato). Sus pedidos, por email. Suprimir = anonimizar: los pedidos terminados (despachados,
// cancelados, devueltos) pierden nombre, contacto y domicilio; se conservan la foto fiscal y el
// cobro (comprobante de la venta: obligación legal). Lo en curso (sin pagar vigente, pagado sin
// despachar, en revisión) no se toca hasta que termine: se dice.
import { conTenant } from "@/nucleo/db/con-tenant";
import type { SeccionDeDatos } from "@/nucleo/modulos/contrato";

const EN_CURSO = ["PENDIENTE", "PAGADO", "EN_REVISION"] as const;

export async function buscarDatosTienda(tenantId: string, email: string): Promise<SeccionDeDatos[]> {
  const pedidos = await conTenant(tenantId, (tx) =>
    tx.tiendaPedido.findMany({ where: { email: { equals: email, mode: "insensitive" } }, include: { items: { select: { nombreProducto: true, cantidad: true } } }, orderBy: { creadoEn: "desc" } }),
  );
  return [
    {
      titulo: "Pedidos de la tienda",
      filas: pedidos.map((p) => ({
        pedido: p.id,
        fecha: p.creadoEn.toISOString(),
        estado: p.estado,
        nombre: p.nombre,
        email: p.email,
        telefono: p.telefono,
        domicilio: [p.calle, p.numero, p.piso].filter(Boolean).join(" "),
        ciudad: p.ciudad,
        provincia: p.provincia,
        codigoPostal: p.codigoPostal,
        documento: p.documento,
        productos: p.items.map((i) => `${i.nombreProducto} × ${i.cantidad}`).join(", "),
        total: p.total,
      })),
    },
  ];
}

export async function suprimirDatosTienda(tenantId: string, email: string): Promise<{ anonimizados: number; conservados: string[] }> {
  return conTenant(tenantId, async (tx) => {
    const todos = await tx.tiendaPedido.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, estado: true } });
    const enCurso = todos.filter((p) => (EN_CURSO as readonly string[]).includes(p.estado));
    const terminados = todos.filter((p) => !(EN_CURSO as readonly string[]).includes(p.estado));
    for (const p of terminados) {
      await tx.tiendaPedido.update({
        where: { id: p.id },
        data: { nombre: "Anónimo", email: `suprimido-${p.id.slice(0, 8)}@invalid`, telefono: "", calle: "", numero: "", piso: "", codigoPostal: "", documento: null },
      });
    }
    const conservados: string[] = [];
    if (terminados.some((p) => p.estado !== "CANCELADO")) conservados.push("el comprobante de cada compra de la tienda (foto fiscal y cobro), por obligación legal");
    if (enCurso.length) conservados.push(`${enCurso.length} ${enCurso.length === 1 ? "pedido de la tienda en curso" : "pedidos de la tienda en curso"} (se anonimizan cuando terminen; pedí de nuevo después)`);
    return { anonimizados: terminados.length, conservados };
  });
}
