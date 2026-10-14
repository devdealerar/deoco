import Link from "next/link";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import { Insignia } from "@/ui";
import type { Margen } from "../productos";
import { formatearPesos } from "@/nucleo/dinero";

export const puedeEditar = (slug: string) => puedeEnPedido("tienda.producto.editar", `/b/${slug}/tienda`);

/** Título y pestañas de la tienda en el panel. */
export function Encabezado({
  slug,
  actual,
  puedeEditar,
}: {
  slug: string;
  actual: "" | "/disenos" | "/pedidos" | "/deuda";
  puedeEditar: boolean;
}) {
  const pestanas = [
    ["", "Productos"],
    ["/disenos", "Diseños"],
    ["/pedidos", "Pedidos"],
    ["/deuda", "Deuda con proveedores"],
  ] as const;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-display-xs font-semibold text-primary">Tienda</h1>
        {!puedeEditar && <Insignia>Solo lectura</Insignia>}
      </div>
      <nav aria-label="Tienda" className="flex gap-1 text-sm font-semibold">
        {pestanas.map(([ruta, etiqueta]) => (
          <Link
            key={ruta}
            href={`/b/${slug}/tienda${ruta}`}
            aria-current={actual === ruta ? "page" : undefined}
            className={`rounded-md px-3 py-2 ${actual === ruta ? "bg-primary_hover text-primary" : "text-tertiary hover:text-secondary"}`}
          >
            {etiqueta}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Precio, costo y margen de un producto. Lo que le queda a la banda; Deoco no se lleva nada. */
export function PanelMargen({ m, envio }: { m: Margen; envio: number }) {
  const filas: [string, string][] = [
    ["Precio de venta (lo que paga el fan por el producto)", formatearPesos(m.precio)],
    ["Costo de producción", `− ${formatearPesos(m.costoProduccion)}`],
  ];
  return (
    <section data-margen className="flex flex-col gap-4 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
      <h2 className="text-lg font-semibold text-primary">Precio y margen</h2>
      <dl className="flex flex-col gap-2 text-md">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-tertiary">{k}</dt>
            <dd className="font-medium text-primary tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-4 border-t border-secondary pt-3 text-lg">
          <dt className="font-semibold text-primary">Margen para la banda</dt>
          <dd data-valor-margen className={`font-semibold tabular-nums ${m.negativo ? "text-error-primary" : "text-success-primary"}`}>
            {formatearPesos(m.margen)} · {m.porcentaje.toLocaleString("es-AR")}%
          </dd>
        </div>
      </dl>
      {m.negativo && (
        <p role="alert" data-margen-negativo className="rounded-lg bg-error-primary p-4 text-md font-semibold text-error-primary ring-1 ring-error_subtle ring-inset">
          Con este precio perdés {formatearPesos(-m.margen)} por cada venta. Podés guardarlo igual (por ejemplo, para una fecha
          especial), pero cada venta te cuesta plata.
        </p>
      )}
      <p className="text-sm text-tertiary" data-envio-aparte>
        El envío ({formatearPesos(envio)}) lo paga el fan aparte (uno por paquete) y es para el proveedor: no entra en tu margen.
      </p>
      <p className="text-sm text-tertiary">
        El margen es lo que le queda a la banda. <strong className="text-secondary">Deoco no se lleva nada de la venta</strong>: el fan te
        paga a vos, en tu pasarela de pago. No incluye la comisión que cobra la pasarela.
      </p>
    </section>
  );
}
