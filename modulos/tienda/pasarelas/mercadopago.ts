import type { Pasarela } from "./tipos";

/** Mercado Pago (Checkout Pro), con la cuenta de la banda. */
export const mercadoPago: Pasarela = {
  id: "mercadopago",
  nombre: "Mercado Pago",
  credenciales: [
    {
      clave: "mercadopago_access_token",
      etiqueta: "Mercado Pago · Access token",
      ayuda: "Mercado Pago → Tus integraciones → tu aplicación → Credenciales de producción → Access token (APP_USR-…).",
    },
  ],
  obligatorias: ["mercadopago_access_token"],
};
