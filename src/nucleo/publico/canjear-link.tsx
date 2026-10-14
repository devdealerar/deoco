"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Lee el token del link del mail (después de "#", que nunca llega a un servidor), lo canjea
 * por la cookie de acceso con `canjear` (una acción del servidor del módulo), lo saca de la
 * barra de direcciones y vuelve a pedir la página, que ahora lo muestra todo.
 */
export function CanjearLink({ canjear }: { canjear: (token: string) => Promise<boolean> }) {
  const router = useRouter();
  useEffect(() => {
    const canjearDelLink = () => {
      const token = window.location.hash.slice(1);
      if (!/^[0-9a-f]{16,64}$/.test(token)) return;
      void canjear(token).then((ok) => {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        if (ok) router.refresh();
      });
    };
    canjearDelLink();
    // El link del mail abierto en una pestaña que ya mostraba esta página: solo cambia el "#".
    window.addEventListener("hashchange", canjearDelLink);
    return () => window.removeEventListener("hashchange", canjearDelLink);
  }, [canjear, router]);
  return null;
}
