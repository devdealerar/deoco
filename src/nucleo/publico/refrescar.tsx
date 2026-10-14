"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Mientras el pago se confirma (el aviso puede tardar), la página se vuelve a pedir sola. */
export function Refrescar({ cadaSegundos = 5 }: { cadaSegundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), cadaSegundos * 1000);
    return () => clearInterval(t);
  }, [router, cadaSegundos]);
  return null;
}
