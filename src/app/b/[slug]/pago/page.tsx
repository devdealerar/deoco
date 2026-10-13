import { exigirTitular } from "@/nucleo/acceso/panel";

// Pago de la cuota de Deoco. La define el núcleo (una banda sin módulos prendidos
// igual tiene que poder pagar). Solo el titular; el staff no pasa.
export default async function Pago({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/pago`);
  return (
    <main>
      <h1>Pago de la cuota</h1>
      <p data-testid="estado">{acceso.estado}</p>
    </main>
  );
}
