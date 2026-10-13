import { exigirPlataforma } from "@/nucleo/acceso/panel";
import { ingresar } from "./acciones";

export default async function Ingresar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; error?: string }>;
}) {
  await exigirPlataforma();
  const { volver = "/", error } = await searchParams;
  return (
    <main>
      <h1>Ingresar</h1>
      {error && <p role="alert">Email o contraseña incorrectos.</p>}
      <form action={ingresar}>
        <input type="hidden" name="volver" value={volver} />
        <label>
          Email <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Contraseña <input name="contrasena" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Ingresar</button>
      </form>
    </main>
  );
}
