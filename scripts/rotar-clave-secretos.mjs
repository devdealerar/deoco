// Rotación de DEOCO_CLAVE_SECRETOS: recifra todas las credenciales de las bandas con la clave
// nueva. Se corre en la consola del contenedor de la app (ver docs/despliegue.md, "Rotar la
// clave de secretos"), con la nueva en DEOCO_CLAVE_SECRETOS y la vieja en
// DEOCO_CLAVE_SECRETOS_ANTERIOR:
//
//   node scripts/rotar-clave-secretos.mjs
//
// Todo o nada: en una transacción, con las filas bloqueadas. Si alguna credencial no abre con
// ninguna de las dos claves, no cambia nada y dice cuál (banda, módulo, clave; nunca el valor).
// Se puede correr de nuevo: lo que ya está con la nueva se deja como está.
// Formato idéntico a src/nucleo/secretos/cifrado.ts (lo prueba tests/secretos.test.ts).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const VERSION = 1;

/** 32 bytes desde base64, o null. */
export function leerClave(cruda) {
  const clave = Buffer.from((cruda ?? "").trim(), "base64");
  return clave.length === 32 ? clave : null;
}

function abrir(cifrado, contexto, clave) {
  const b = Buffer.from(cifrado);
  if (b[0] !== VERSION || b.length < 29) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", clave, b.subarray(1, 13));
    d.setAAD(Buffer.from(contexto));
    d.setAuthTag(b.subarray(13, 29));
    return Buffer.concat([d.update(b.subarray(29)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function cerrar(valor, contexto, clave) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave, iv);
  c.setAAD(Buffer.from(contexto));
  const datos = Buffer.concat([c.update(valor, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), datos]);
}

/**
 * Recifra con `nueva` lo que esté con `anterior`. `db`: un pg.Client conectado con el rol
 * dueño. Devuelve { recifradas, yaEstaban }; si alguna no abre, tira y no cambia nada.
 */
export async function rotarSecretos(db, { anterior, nueva }) {
  await db.query("BEGIN");
  try {
    const { rows } = await db.query(`SELECT id, "tenantId", "moduloId", clave, cifrado FROM secreto ORDER BY id FOR UPDATE`);
    let recifradas = 0;
    let yaEstaban = 0;
    const rotas = [];
    for (const f of rows) {
      const contexto = `deoco/secreto/${f.tenantId}/${f.moduloId}/${f.clave}`;
      if (abrir(f.cifrado, contexto, nueva) !== null) {
        yaEstaban++;
        continue;
      }
      const valor = abrir(f.cifrado, contexto, anterior);
      if (valor === null) {
        rotas.push(`banda ${f.tenantId} · ${f.moduloId} · ${f.clave}`);
        continue;
      }
      await db.query(`UPDATE secreto SET cifrado = $1 WHERE id = $2`, [cerrar(valor, contexto, nueva), f.id]);
      recifradas++;
    }
    if (rotas.length > 0) {
      throw new Error(
        `No se pudieron abrir ${rotas.length} credenciales con ninguna de las dos claves (no se cambió nada):\n  ${rotas.join("\n  ")}`,
      );
    }
    await db.query("COMMIT");
    return { recifradas, yaEstaban };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nueva = leerClave(process.env.DEOCO_CLAVE_SECRETOS);
  const anterior = leerClave(process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR);
  const url = process.env.DATABASE_URL_MIGRACIONES;
  const falta = [
    !nueva && "DEOCO_CLAVE_SECRETOS (la nueva, 32 bytes en base64)",
    !anterior && "DEOCO_CLAVE_SECRETOS_ANTERIOR (la vieja, 32 bytes en base64)",
    !url && "DATABASE_URL_MIGRACIONES (rol dueño)",
  ].filter(Boolean);
  if (falta.length > 0) {
    console.error(`Falta o está mal: ${falta.join(", ")}.`);
    process.exit(1);
  }
  if (nueva.equals(anterior)) {
    console.error("La clave nueva y la anterior son la misma: no hay nada que rotar.");
    process.exit(1);
  }
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { recifradas, yaEstaban } = await rotarSecretos(db, { anterior, nueva });
    console.log(`Listo: ${recifradas} recifradas con la clave nueva, ${yaEstaban} ya estaban. Ya podés quitar DEOCO_CLAVE_SECRETOS_ANTERIOR.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
