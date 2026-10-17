import Link from "next/link";
import { cookies } from "next/headers";
import { nombreDeBanda } from "@/nucleo/modulos/metadatos";
import { COOKIE_CONSENTIMIENTO, leerConsentimiento } from "@/nucleo/legal/cookies";
import { LEYENDA_AAIP } from "@/nucleo/legal/textos";
import { c } from "@/nucleo/publico/estilo";
import { AvisoCookies, PreferenciasCookies } from "./aviso-cookies";

/**
 * Lo legal del sitio de cada banda (D2), dentro de su marco (con su estilo): el pie con la política
 * de privacidad, los términos, el canal para los datos personales, el botón de arrepentimiento y
 * las preferencias de cookies; y el aviso de cookies si el visitante no decidió.
 */
export async function CapaLegal({ conVentas }: { conVentas: boolean }) {
  const decision = leerConsentimiento((await cookies()).get(COOKIE_CONSENTIMIENTO)?.value);
  return (
    <>
      <footer className={`mt-12 border-t pt-6 text-xs ${c.linea} ${c.suave}`} data-pie-legal>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/privacidad" className="underline">
            Privacidad
          </Link>
          <Link href="/terminos" className="underline">
            Términos
          </Link>
          <Link href="/datos-personales" className="underline">
            Tus datos personales
          </Link>
          {conVentas && (
            <Link href="/mis-compras" className="underline" data-mis-compras>
              Mis compras
            </Link>
          )}
          {conVentas && (
            <Link href="/arrepentimiento" className="underline" data-boton-arrepentimiento>
              Botón de arrepentimiento
            </Link>
          )}
          <PreferenciasCookies />
        </nav>
      </footer>
      <AvisoCookies decidido={!!decision} analitica={decision?.analitica ?? false} marketing={decision?.marketing ?? false} />
    </>
  );
}

/** Junto a un formulario que pide datos (checkout, compra de entradas): quién los trata y la leyenda de la AAIP. */
export async function AvisoDeDatos({ tenantId }: { tenantId: string }) {
  const banda = (await nombreDeBanda(tenantId))?.nombre ?? "la banda";
  return (
    <p className={`text-xs ${c.suave}`} data-aviso-datos>
      Tus datos los trata {banda} para esta compra (los obligatorios están marcados; sin ellos no se puede completar). Podés ver, corregir o borrar tus
      datos desde{" "}
      <Link href="/datos-personales" className="underline">
        Tus datos personales
      </Link>
      . Más en la{" "}
      <Link href="/privacidad" className="underline">
        política de privacidad
      </Link>
      . {LEYENDA_AAIP}
    </p>
  );
}
