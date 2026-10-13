import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Dónde viven los bytes de los archivos. Los módulos nunca lo ven: usan las funciones
 * de src/nucleo/archivos. Cambiar de disco a S3/MinIO/R2 es otra implementación de
 * esta interfaz, elegida por DEOCO_ALMACEN.
 */
export interface Almacen {
  guardar(clave: string, datos: Buffer): Promise<void>;
  /** null si no existe. */
  leer(clave: string): Promise<ReadableStream<Uint8Array> | null>;
  borrar(clave: string): Promise<void>;
}

/** Disco del VPS: en Easypanel, un volumen persistente montado en DEOCO_ARCHIVOS_DIR. */
export class AlmacenDisco implements Almacen {
  constructor(private readonly base: string) {}

  private ruta(clave: string) {
    // turbopackIgnore: la carpeta del almacén es de ejecución (volumen), no código a empaquetar.
    const ruta = path.resolve(/*turbopackIgnore: true*/ this.base, clave);
    if (!ruta.startsWith(path.resolve(/*turbopackIgnore: true*/ this.base) + path.sep)) throw new Error(`Clave inválida: ${clave}`);
    return ruta;
  }

  async guardar(clave: string, datos: Buffer) {
    const ruta = this.ruta(clave);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, datos);
  }

  async leer(clave: string) {
    const ruta = this.ruta(clave);
    try {
      await stat(ruta);
    } catch {
      return null;
    }
    return Readable.toWeb(createReadStream(ruta)) as ReadableStream<Uint8Array>;
  }

  async borrar(clave: string) {
    await rm(this.ruta(clave), { force: true });
  }
}

let instancia: Almacen | undefined;

export function almacen(): Almacen {
  if (instancia) return instancia;
  const tipo = process.env.DEOCO_ALMACEN ?? "disco";
  if (tipo !== "disco") throw new Error(`DEOCO_ALMACEN="${tipo}" no está implementado (solo "disco").`);
  instancia = new AlmacenDisco(path.resolve(/*turbopackIgnore: true*/ process.env.DEOCO_ARCHIVOS_DIR ?? ".archivos"));
  return instancia;
}
