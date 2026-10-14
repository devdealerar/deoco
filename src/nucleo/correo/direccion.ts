// Qué es una dirección de correo válida: la misma regla para lo que se carga (fan, contacto,
// proveedor) y para lo que enviarCorreo acepta. Si un formulario aceptara algo que el correo
// rechaza, el mail fallaría después, en silencio.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** algo@dominio.tld, sin espacios ni separadores, hasta 254 caracteres. */
export function esEmail(v: string): boolean {
  return v.length <= 254 && EMAIL.test(v);
}
