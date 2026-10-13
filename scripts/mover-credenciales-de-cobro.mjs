// Una sola vez, al actualizar a la versión con cobros en el núcleo: las credenciales de Mercado
// Pago que los titulares cargaron en la tienda (módulo "tienda") pasan a Credenciales → Cobros
// (módulo "pagos"), donde las usan la tienda y la ticketera. Se corre en la consola de la app:
//
//   node scripts/mover-credenciales-de-cobro.mjs
//
// Recifra cada una con su nuevo lugar (el cifrado está atado a banda/módulo/clave). Todo o
// nada; repetible (si ya está en "pagos", no la pisa). Nunca muestra un valor.
import { pathToFileURL } from "node:url";
import pg from "pg";
import { abrir, cerrar, leerClave } from "./rotar-clave-secretos.mjs";

const DE = "tienda";
const A = "pagos";
const contexto = (t, m, c) => `deoco/secreto/${t}/${m}/${c}`;

/** Devuelve { movidas, yaEstaban }. `db`: pg.Client con el rol dueño. */
export async function moverCredenciales(db, clave) {
  await db.query("BEGIN");
  try {
    const { rows } = await db.query(
      `SELECT * FROM secreto WHERE "moduloId" = $1 AND clave LIKE 'mercadopago\\_%' ORDER BY id FOR UPDATE`,
      [DE],
    );
    let movidas = 0;
    let yaEstaban = 0;
    for (const f of rows) {
      const existe = await db.query(`SELECT 1 FROM secreto WHERE "tenantId" = $1 AND "moduloId" = $2 AND clave = $3`, [f.tenantId, A, f.clave]);
      if (existe.rowCount > 0) {
        yaEstaban++;
      } else {
        const valor = abrir(f.cifrado, contexto(f.tenantId, DE, f.clave), clave);
        if (valor === null) throw new Error(`No se pudo abrir: banda ${f.tenantId} · ${f.clave} (¿otra DEOCO_CLAVE_SECRETOS?). No se cambió nada.`);
        await db.query(
          `INSERT INTO secreto (id, "tenantId", "moduloId", clave, cifrado, pista, "actualizadoEn", "actualizadoPor")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
          [f.tenantId, A, f.clave, cerrar(valor, contexto(f.tenantId, A, f.clave), clave), f.pista, f.actualizadoEn, f.actualizadoPor],
        );
        movidas++;
      }
      await db.query(`DELETE FROM secreto WHERE id = $1`, [f.id]);
    }
    await db.query("COMMIT");
    return { movidas, yaEstaban };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const clave = leerClave(process.env.DEOCO_CLAVE_SECRETOS);
  const url = process.env.DATABASE_URL_MIGRACIONES;
  if (!clave || !url) {
    console.error("Faltan DEOCO_CLAVE_SECRETOS (32 bytes en base64) o DATABASE_URL_MIGRACIONES.");
    process.exit(1);
  }
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const r = await moverCredenciales(db, clave);
    console.log(`Listo: ${r.movidas} credenciales movidas a Cobros, ${r.yaEstaban} ya estaban.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
