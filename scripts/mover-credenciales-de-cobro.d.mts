import type pg from "pg";
export function moverCredenciales(db: pg.Client, clave: Buffer): Promise<{ movidas: number; yaEstaban: number }>;
