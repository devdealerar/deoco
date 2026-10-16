// Textos legales. Los de Deoco con la banda (términos del servicio y contrato de encargo de
// tratamiento) son fijos y versionados: cambiar una coma es una versión nueva, que el titular
// tiene que volver a aceptar. Los del sitio de cada banda se arman con sus datos (./index.ts).
//
// BORRADOR TÉCNICO: lo armó el equipo de producto con lo que exige la ley (docs/privacidad.md).
// Tiene que revisarlo un abogado antes de la primera banda real.

export const VERSION_TERMINOS_DEOCO = "2026-10-16";
export const VERSION_ENCARGO = "2026-10-16";
/** El aviso de cookies del sitio de una banda. Una versión nueva vuelve a preguntar. */
export const VERSION_COOKIES = "2026-10-16";

/** La leyenda que la Resolución AAIP 14/2018 (art. 3) pide junto a donde se recolectan datos. */
export const LEYENDA_AAIP =
  "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.";

export type Documento = { id: "terminos-deoco" | "encargo-tratamiento"; titulo: string; version: string; secciones: { titulo: string; parrafos: string[] }[] };

/**
 * Quién trata los datos por cuenta de la banda y dónde (Ley 25.326 art. 12 y 25; LGPD art. 39).
 * Se muestra en la política de cada banda y en el contrato de encargo.
 */
export const SUBENCARGADOS: { quien: string; para: string; pais: string }[] = [
  { quien: "Proveedor del servidor (VPS)", para: "alojar la base de datos y los archivos", pais: "según la región del servidor contratado" },
  { quien: "Cloudflare", para: "red de entrega, certificados y DNS", pais: "Estados Unidos (red global)" },
  { quien: "Resend", para: "envío de correos", pais: "Estados Unidos" },
  { quien: "Mercado Pago", para: "la cuota de Deoco (la banda cobra sus ventas con su propia cuenta)", pais: "Argentina" },
];

export const TERMINOS_DEOCO: Documento = {
  id: "terminos-deoco",
  titulo: "Términos del servicio de Deoco",
  version: VERSION_TERMINOS_DEOCO,
  secciones: [
    {
      titulo: "1. Qué es Deoco",
      parrafos: [
        "Deoco es una plataforma para bandas: sitio, tienda de merchandising y venta de entradas. La banda la usa por una cuota mensual según su plan.",
        "El dinero de las ventas no pasa por Deoco: el fan le paga a la banda en la pasarela de la banda, y la banda le paga al proveedor. Deoco coordina, muestra y calcula; no cobra, no custodia y no reparte el dinero de las ventas.",
      ],
    },
    {
      titulo: "2. La cuenta",
      parrafos: [
        "Cada banda tiene un único titular registrado, que conserva el control de la cuenta, el cobro y el plan, y puede pasarle la titularidad a otra persona de la banda. Deoco no arbitra disputas entre integrantes.",
        "La banda es responsable de lo que publica y de tener los derechos sobre los diseños, logos, fotos y demás material que sube.",
      ],
    },
    {
      titulo: "3. La cuota",
      parrafos: [
        "La cuota se paga por mes. Si un cobro se rechaza, se reintenta; si no se regulariza, la cuenta pasa por aviso, solo lectura (a los 30 días), sitio despublicado (a los 60) y archivo (a los 90). Nunca se borra nada por la cuota, y lo ya vendido sigue en pie.",
        "Bajar de plan no corta nada vendido ni abierto. Subir de plan a mitad del mes suma la diferencia proporcional al próximo cobro.",
      ],
    },
    {
      titulo: "4. Los datos son de la banda",
      parrafos: [
        "Todo lo que la banda carga y lo que generan sus ventas es de la banda. La banda puede exportarlo completo cuando quiera, desde el panel, sin pedir permiso, también si deja de usar Deoco.",
        "Deoco trata los datos de los fans por cuenta de la banda, según el Contrato de encargo de tratamiento, que forma parte de estos términos.",
      ],
    },
    {
      titulo: "5. Baja",
      parrafos: ["La banda puede cancelar la suscripción desde Plan y pago, sin trámite. Antes o después, puede exportar todos sus datos."],
    },
  ],
};

export const ENCARGO_TRATAMIENTO: Documento = {
  id: "encargo-tratamiento",
  titulo: "Contrato de encargo de tratamiento de datos personales",
  version: VERSION_ENCARGO,
  secciones: [
    {
      titulo: "1. Partes y roles",
      parrafos: [
        "La banda es la responsable de la base de datos de sus fans y compradores (Ley 25.326 de Argentina; \"controladora\" según la LGPD de Brasil).",
        "Deoco presta el servicio de tratamiento por cuenta de la banda (art. 25 de la Ley 25.326 y su decreto reglamentario; \"operadora\" según la LGPD): guarda, procesa y envía esos datos solo para darle el servicio.",
      ],
    },
    {
      titulo: "2. Instrucciones y finalidad",
      parrafos: [
        "Deoco trata los datos solo según las instrucciones de la banda y para las finalidades del servicio: operar el sitio, la tienda, la venta de entradas, los envíos de correo y lo que la banda prenda en su cuenta.",
        "Deoco no usa los datos de los fans para fines propios, no los cede ni los vende, y no los cruza entre bandas: una misma persona que compra en dos bandas son dos registros sin relación.",
      ],
    },
    {
      titulo: "3. Seguridad y confidencialidad",
      parrafos: [
        "Deoco aplica medidas técnicas y organizativas para proteger los datos: aislamiento de cada banda en el motor de la base de datos, cifrado de credenciales, registro de actividad que no se puede alterar, copias diarias y acceso del equipo de soporte solo con motivo registrado y visible para la banda.",
        "Las personas de Deoco que acceden a los datos están obligadas a la confidencialidad, aun después de terminado el servicio.",
      ],
    },
    {
      titulo: "4. Subencargados",
      parrafos: [
        "Para dar el servicio, Deoco usa los proveedores listados en la política de privacidad de la banda (servidor, red de entrega, envío de correos). Algunos están fuera de la Argentina; Deoco exige de ellos un nivel de protección adecuado. Deoco avisa en el panel antes de sumar uno nuevo.",
      ],
    },
    {
      titulo: "5. Derechos de los fans",
      parrafos: [
        "Deoco le da a la banda las herramientas para atender los pedidos de acceso, rectificación, supresión y oposición de sus fans dentro de los plazos legales: un formulario en el sitio, el registro con el vencimiento de cada pedido y la búsqueda y anonimización de los datos de una persona.",
      ],
    },
    {
      titulo: "6. Incidentes",
      parrafos: ["Si Deoco detecta un incidente de seguridad que afecte datos de la banda, le avisa sin demora indebida, con lo que se sabe y lo que se hizo, para que la banda pueda cumplir con sus avisos."],
    },
    {
      titulo: "7. Fin del servicio",
      parrafos: [
        "Al terminar el servicio la banda puede exportar todo. Después, Deoco destruye los datos de los fans, salvo que la banda autorice expresamente conservarlos (hasta dos años, por si vuelve) o que una ley obligue a guardar algo (por ejemplo, comprobantes de venta).",
      ],
    },
  ],
};

export const DOCUMENTOS_DEOCO = [TERMINOS_DEOCO, ENCARGO_TRATAMIENTO];

/** La política de privacidad de Deoco para las personas de las bandas (sus cuentas en la plataforma). */
export const PRIVACIDAD_DEOCO: Documento & { id: "terminos-deoco" | "encargo-tratamiento" } = {
  id: "terminos-deoco",
  titulo: "Política de privacidad de Deoco (cuentas de las bandas)",
  version: VERSION_TERMINOS_DEOCO,
  secciones: [
    {
      titulo: "Qué datos guardamos de vos",
      parrafos: [
        "Si tenés una cuenta en Deoco (sos parte de una banda o del staff): tu nombre, tu email, tu contraseña (cifrada: nadie la puede leer), las bandas de las que sos parte y tu rol, y lo que hacés en el panel (el registro de actividad, que la banda puede ver).",
        "Para cobrar la cuota de Deoco, la pasarela de pago guarda los datos de tu medio de pago; Deoco no ve ni guarda los números de tu tarjeta.",
      ],
    },
    {
      titulo: "Para qué",
      parrafos: ["Para darte acceso, cobrar la cuota, avisarte lo que pasa con tu cuenta y cumplir con la ley. No los usamos para publicidad ni los vendemos."],
    },
    {
      titulo: "Los datos de los fans",
      parrafos: ["Los datos de quienes compran en el sitio de una banda son de la banda, que es la responsable. Deoco los trata por su cuenta, según el contrato de encargo de tratamiento (/encargo)."],
    },
    {
      titulo: "Tus derechos",
      parrafos: [`Podés pedir acceso, corrección o borrado de tus datos escribiéndole al equipo de Deoco. ${"La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales."}`],
    },
  ],
};
