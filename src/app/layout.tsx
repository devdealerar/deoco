import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { conTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

// En el sitio público (también en su 404) el título es el de la banda, nunca "Deoco";
// cada página pública lo completa con generateMetadata. Deoco es solo la plataforma.
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return { title: "Deoco" };
  const t = await conTenant(ctx.tenantId, (tx) => tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { nombre: true } }));
  return { title: t?.nombre ?? "" };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="bg-primary text-primary">{children}</body>
    </html>
  );
}
