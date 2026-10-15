import Link from "next/link";

// 403 del panel: la persona entró a la banda pero su rol no incluye esta sección (o es Plan y
// pago y no es titular). Que sepa por qué y a quién pedírselo.
export default function Prohibido() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-2xl font-semibold">No tenés acceso a esta sección</h1>
      <p className="mt-4">Tu rol en esta banda no la incluye. Si la necesitás, pedíselo a quien es titular de la banda.</p>
      <p className="mt-4">
        <Link href="/" className="underline">
          Volver a mis bandas
        </Link>
      </p>
    </main>
  );
}
