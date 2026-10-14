// Alta de una persona del STAFF de Deoco (la primera; las demás bandas y personas, por /admin).
// Se corre en la consola del contenedor de la app, que ya tiene DATABASE_URL_MIGRACIONES:
//
//   CLAVE='una-clave-larga' node scripts/crear-staff.mjs vos@deoco.com "Tu Nombre"
//
// Si el email ya existe, lo marca como staff y le pone esa clave. La clave no se guarda en
// claro ni queda en el historial de la base (solo su hash argon2id).
import { hash } from "@node-rs/argon2";
import pg from "pg";

const [email, nombre] = process.argv.slice(2);
const clave = process.env.CLAVE ?? "";
if (!email || !nombre) {
  console.error('Uso: CLAVE=\'...\' node scripts/crear-staff.mjs <email> "<nombre>"');
  process.exit(1);
}
if (clave.length < 10) {
  console.error("La clave (variable CLAVE) tiene que tener al menos 10 caracteres.");
  process.exit(1);
}
const url = process.env.DATABASE_URL_MIGRACIONES;
if (!url) {
  console.error("Falta DATABASE_URL_MIGRACIONES (rol dueño).");
  process.exit(1);
}

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const r = await db.query(
    `INSERT INTO usuario (id, email, nombre, "hashContrasena", "esStaff", "claveTemporal")
     VALUES (gen_random_uuid(), lower($1), $2, $3, true, false)
     ON CONFLICT (email) DO UPDATE SET "esStaff" = true, "hashContrasena" = EXCLUDED."hashContrasena", "claveTemporal" = false
     RETURNING (xmax = 0) AS nuevo`,
    [email, nombre, await hash(clave)],
  );
  console.log(`${r.rows[0].nuevo ? "Creado" : "Actualizado"}: ${email.toLowerCase()} es staff. Entrá en https://app.${process.env.DEOCO_DOMINIO_RAIZ ?? "<dominio>"}/admin`);
} finally {
  await db.end();
}
