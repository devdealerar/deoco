import { exigirPlataforma } from "@/nucleo/acceso/panel";
import { Tarjeta } from "@/ui";
import { confirmarAccion } from "../acciones";
import { Confirmar } from "./confirmar";

export default async function Verificar() {
  await exigirPlataforma();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <span className="text-center text-display-sm font-bold tracking-tight text-primary">deoco</span>
        <Tarjeta titulo="Confirmá tu email">
          <Confirmar confirmar={confirmarAccion} />
        </Tarjeta>
      </div>
    </main>
  );
}
