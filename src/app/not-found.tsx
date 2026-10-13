import type { Metadata } from "next";
import Link from "next/link";
import { conTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

// 404. En el host de una banda el título es el de la banda (nunca "Deoco" ni el de Next).
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return { title: "No encontrado · Deoco" };
  const t = await conTenant(ctx.tenantId, (tx) => tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { nombre: true } }));
  return { title: t?.nombre ?? "" };
}

export default function NoEncontrado() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-2xl font-semibold">Esta página no existe</h1>
      <p className="mt-4">
        <Link href="/" className="underline">
          Volver al inicio
        </Link>
      </p>
    </main>
  );
}
