import { Aviso } from "@/ui";

/**
 * La privacidad del WHOIS, dicha antes de comprar: incluida en el precio y activada, o, si la
 * terminación no la permite, que los datos del titular quedan públicos.
 */
export function Privacidad({ dominio, incluida }: { dominio: string; incluida: boolean }) {
  const tld = dominio.split(".").slice(1).join(".");
  return (
    <div data-privacidad={incluida ? "incluida" : "no-disponible"}>
      {incluida ? (
        <Aviso tono="info" titulo="Privacidad incluida">
          Los datos del titular (dirección, teléfono, mail) no aparecen en la consulta pública de dominios (WHOIS). Está incluida en el precio y activada desde el primer día.
        </Aviso>
      ) : (
        <Aviso tono="advertencia" titulo={`Los dominios .${tld} no permiten ocultar los datos del titular`}>
          El nombre, la dirección, el teléfono y el mail que pongas pueden quedar a la vista de cualquiera en la consulta pública de dominios (WHOIS). Si preferís, ponelo a nombre de alguien que
          esté de acuerdo con eso o elegí otra terminación.
        </Aviso>
      )}
    </div>
  );
}
