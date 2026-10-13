import type pg from "pg";
export function leerClave(cruda: string | undefined): Buffer | null;
export function rotarSecretos(db: pg.Client, claves: { anterior: Buffer; nueva: Buffer }): Promise<{ recifradas: number; yaEstaban: number }>;
