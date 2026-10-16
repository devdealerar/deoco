// Back office · Dominios: precios por terminación y pagos (con sus devoluciones). Aparte de la
// cuota a propósito: es plata distinta, con filas, aviso y estados propios.
import Link from "next/link";
import { formatearPesos, pesosParaCampo } from "@/nucleo/dinero";
import { ZONA } from "@/nucleo/fechas";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { cuotaConfigurada } from "@/nucleo/pagos/cuota";
import { Aviso, Campo, Casilla, Filtros, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { precioPorAnio, preciosDominio } from "../dominios";
import { guardarPrecioDominioAccion, marcarDevueltaAccion, reintentarDevolucionAccion } from "./acciones";
import { cobrosDominioEsperando, FILTROS_PAGOS_DOMINIO, type FiltroPagosDominio, pagina, pagosDeDominios, texto } from "./datos";

const BASE = "/admin/m/comercial";
const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: ZONA });

type Fila = Awaited<ReturnType<typeof pagosDeDominios>>["filas"][number];

function EstadoPago({ p }: { p: Fila }) {
  const devolucion = {
    pendiente: <Insignia color="advertencia">Devolución pendiente</Insignia>,
    "en-proceso": <Insignia color="advertencia">Devolución en proceso</Insignia>,
    fallida: <Insignia color="error">Devolución fallida</Insignia>,
    hecha: <Insignia color="gris">Devuelto</Insignia>,
    "a-mano": <Insignia color="gris">Devuelto a mano</Insignia>,
  }[p.devolucion ?? ""];
  return (
    <div className="flex flex-col items-start gap-1">
      {devolucion ??
        (p.entrega === "pendiente" ? (
          <Insignia color="advertencia">Pagado · compra sin arrancar</Insignia>
        ) : p.entrega === "hecha" ? (
          <Insignia color="exito">Pagado · compra en marcha</Insignia>
        ) : (
          <Insignia color={p.estado === "rechazado" ? "gris" : "advertencia"}>{p.estadoPasarela || p.estado}</Insignia>
        ))}
      {p.devolucionIntentos > 0 && p.devolucion !== "hecha" && <span className="text-xs text-tertiary">{p.devolucionIntentos} intentos</span>}
    </div>
  );
}

export async function AdminDominios({ consulta }: PropsRutaAdmin) {
  const pedido = texto(consulta, "ver");
  const filtro: FiltroPagosDominio = (FILTROS_PAGOS_DOMINIO as readonly string[]).includes(pedido) ? (pedido as FiltroPagosDominio) : "atencion";
  const [precios, { filas, ...paginacion }, esperando] = await Promise.all([preciosDominio(), pagosDeDominios(filtro, pagina(consulta)), cobrosDominioEsperando()]);
  const fallidas = filas.filter((p) => p.devolucion === "fallida");
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Dominios: precios y pagos</h1>
        <p className="mt-1 text-md text-tertiary">
          Lo que las bandas pagan por sus dominios, en la cuenta de Mercado Pago de Deoco. Es plata aparte de la cuota: otros cobros, otro aviso, otros estados. Solo medios inmediatos (sin efectivo ni
          transferencia): un pago queda aprobado o rechazado, nunca pendiente.
        </p>
      </header>
      {!cuotaConfigurada() && <Aviso tono="error" titulo="Sin la cuenta de Deoco (DEOCO_CUOTA_MP_TOKEN): no se pueden cobrar ni devolver dominios." />}
      {fallidas.length > 0 && (
        <Aviso tono="error" titulo={`${fallidas.length === 1 ? "Una devolución no sale" : `${fallidas.length} devoluciones no salen`}`}>
          Se sigue reintentando sola. Si el error no se resuelve (saldo de la cuenta, pago demasiado viejo), devolvé la plata desde Mercado Pago y marcala &quot;devuelta a mano&quot; con la nota de cómo.
        </Aviso>
      )}
      <Filtros>
        <Selector
          name="ver"
          etiqueta="Pagos"
          defaultValue={filtro}
          opciones={[
            { valor: "atencion", texto: "Necesitan atención (devoluciones y compras sin arrancar)" },
            { valor: "devoluciones", texto: "Con devolución" },
            { valor: "todos", texto: "Todos" },
          ]}
        />
      </Filtros>
      <Tabla
        titulo="Pagos de dominios"
        descripcion={`Uno aprobado arranca la compra; cualquier otro aprobado (repetido, monto distinto) y los de compras que fallaron sin registrar se devuelven solos.${esperando ? ` Links de pago abiertos: ${esperando}.` : ""}`}
        paginacion={paginacion}
        columnas={[
          { id: "dominio", etiqueta: "Dominio" },
          { id: "banda", etiqueta: "Banda" },
          { id: "monto", etiqueta: "Monto" },
          { id: "estado", etiqueta: "Estado" },
          { id: "detalle", etiqueta: "Detalle" },
          { id: "accion", etiqueta: "" },
        ]}
        filas={filas.map((p) => ({
          id: p.id,
          celdas: [
            <div key="d" data-pago-dominio={p.pagoId}>
              <div className="font-medium text-primary">{p.cobro.dominio}</div>
              <div className="text-sm text-tertiary">
                {p.cobro.tipo === "alta" ? "Compra" : "Renovación"} · {FECHA.format(p.creadoEn)}
              </div>
            </div>,
            p.banda ? (
              <Link key="b" href={`${BASE}/bandas/${p.tenantId}`} className="text-sm text-secondary hover:text-brand-secondary">
                {p.banda.nombre}
              </Link>
            ) : (
              <span key="b">—</span>
            ),
            <span key="m">{formatearPesos(p.monto)}</span>,
            <EstadoPago key="e" p={p} />,
            <div key="x" className="max-w-sm text-sm">
              <div className="text-tertiary">
                Pago {p.pagoId}
                {p.medio ? ` · ${p.medio}` : ""}
              </div>
              {p.devolucionMotivo && <div className="text-secondary">{p.devolucionMotivo}</div>}
              {p.devolucionError && p.devolucion !== "hecha" && <div className="text-error-primary">{p.devolucionError}</div>}
              {p.entregaError && p.entrega === "pendiente" && <div className="text-error-primary">{p.entregaError}</div>}
              {p.devolucionNota && <div className="text-secondary">A mano: {p.devolucionNota}</div>}
            </div>,
            p.devolucion && ["pendiente", "en-proceso", "fallida"].includes(p.devolucion) ? (
              <div key="a" className="flex min-w-56 flex-col gap-2">
                <Formulario puedeEditar enLinea variante="secundario" accion={reintentarDevolucionAccion.bind(null, p.tenantId, p.id)} etiqueta="Reintentar ya" />
                <Formulario puedeEditar accion={marcarDevueltaAccion.bind(null, p.tenantId, p.id)} etiqueta="Marcar devuelta a mano">
                  <Campo name="nota" etiqueta="Cómo se devolvió" placeholder="Desde Mercado Pago, el 12/10" required />
                </Formulario>
              </div>
            ) : (
              <span key="a" />
            ),
          ],
        }))}
      />
      <Tarjeta
        titulo="Precios por terminación"
        descripcion="Por año, en pesos. Registro: costo del registrador + comisión + colchón por el dólar. Privacidad del WHOIS: lo que cobra el registrador por ocultar los datos del titular; se suma al registro y la banda ve un solo precio (siempre activada). Si la terminación no la permite, desmarcala: no se cobra y a la banda se le avisa antes de comprar. Sin precio (o no a la venta), esa terminación no se vende."
      >
        <div className="flex flex-col gap-6">
          {precios.map((p) => (
            <div key={p.tld} data-precio-tld={p.tld} className="flex flex-col gap-2 border-b border-secondary pb-4">
              <div className="flex items-center gap-2 font-medium text-primary">
                .{p.tld} <span className="text-tertiary">{formatearPesos(precioPorAnio(p))}/año</span>
                {p.privacidad ? (
                  <span className="text-sm text-tertiary">
                    (registro {formatearPesos(p.precio)} + privacidad {formatearPesos(p.costoPrivacidad)})
                  </span>
                ) : (
                  <Insignia color="advertencia">Sin privacidad</Insignia>
                )}
                {!p.aLaVenta && <Insignia>No a la venta</Insignia>}
              </div>
              <Formulario puedeEditar accion={guardarPrecioDominioAccion.bind(null, p.tld)} etiqueta="Guardar">
                <Campo name="precio" etiqueta="Registro por año (pesos)" defaultValue={pesosParaCampo(p.precio)} required />
                <Campo name="costoPrivacidad" etiqueta="Privacidad por año (pesos)" defaultValue={pesosParaCampo(p.costoPrivacidad)} />
                <Casilla name="privacidad" etiqueta="La terminación permite privacidad" marcada={p.privacidad} />
                <Casilla name="aLaVenta" etiqueta="A la venta" marcada={p.aLaVenta} />
              </Formulario>
            </div>
          ))}
          <Formulario puedeEditar accion={guardarPrecioDominioAccion.bind(null, null)} etiqueta="Agregar">
            <Campo name="tld" etiqueta="Terminación" placeholder="com" required />
            <Campo name="precio" etiqueta="Registro por año (pesos)" required />
            <Campo name="costoPrivacidad" etiqueta="Privacidad por año (pesos)" placeholder="0" />
            <Casilla name="privacidad" etiqueta="La terminación permite privacidad" marcada />
            <Casilla name="aLaVenta" etiqueta="A la venta" marcada />
          </Formulario>
        </div>
      </Tarjeta>
    </div>
  );
}
