-- Un solo titular por banda, registrado, y la titularidad se transfiere (3.2 núcleo d6: "el
-- titular registrado conserva el control"; decisión del bloque D). Las demás personas que eran
-- TITULAR pasan a GESTOR: gestionan todo menos la plata y el control de la cuenta.
--
-- Quién queda (el "más antiguo"): las membresías no tenían fecha. En orden: quien creó la banda
-- (`tenant.creadoPor`), después la cuenta más antigua (`usuario.creadoEn`), después el id.
-- Desde ahora cada membresía guarda cuándo se creó.
ALTER TABLE "membresia" ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TEMP TABLE titular_migrado AS
SELECT m."id", m."tenantId", m."usuarioId",
       row_number() OVER (
         PARTITION BY m."tenantId"
         ORDER BY (m."usuarioId" = t."creadoPor") DESC NULLS LAST, u."creadoEn", m."id"
       ) AS orden
FROM "membresia" m
JOIN "tenant" t ON t."id" = m."tenantId"
JOIN "usuario" u ON u."id" = m."usuarioId"
WHERE m."rol" = 'TITULAR'
  AND m."tenantId" IN (SELECT "tenantId" FROM "membresia" WHERE "rol" = 'TITULAR' GROUP BY "tenantId" HAVING count(*) > 1);

UPDATE "membresia" m SET "rol" = 'GESTOR' FROM titular_migrado x WHERE x."id" = m."id" AND x.orden > 1;

-- Registro de actividad (td3): una fila por persona que dejó de ser titular.
INSERT INTO "auditoria" ("id", "usuarioId", "tenantId", "accion", "detalle")
SELECT gen_random_uuid(), NULL, x."tenantId", 'membresia.titular_unico',
       jsonb_build_object('usuarioId', x."usuarioId", 'de', 'TITULAR', 'a', 'GESTOR',
                          'quedaTitular', (SELECT y."usuarioId" FROM titular_migrado y WHERE y."tenantId" = x."tenantId" AND y.orden = 1))
FROM titular_migrado x WHERE x.orden > 1;

-- Aviso por mail a cada persona afectada (sale con el barrido, como cualquier correo pendiente).
INSERT INTO "correo" ("id", "tenantId", "moduloId", "para", "nombreRemitente", "asunto", "html", "texto", "claveUnica")
SELECT gen_random_uuid(), x."tenantId", 'nucleo', u."email", 'Deoco',
       t."nombre" || ': ahora hay un solo titular',
       '<div style="font-family:system-ui,sans-serif;color:#1c1917;line-height:1.5;max-width:560px"><p>Hola, ' || replace(replace(u."nombre", '<', '&lt;'), '>', '&gt;') || ':</p>'
         || CASE WHEN x.orden = 1
              THEN '<p>En Deoco cada banda tiene ahora un solo titular registrado: la persona que conserva el control de la cuenta, el cobro y el plan. En ' || replace(replace(t."nombre", '<', '&lt;'), '>', '&gt;') || ' sos vos. Las demás personas que eran titulares pasaron a gestor: siguen gestionando todo, menos la plata y el equipo.</p><p>Si querés pasarle la titularidad a otra persona, lo hacés desde Equipo, en el panel de la banda.</p>'
              ELSE '<p>En Deoco cada banda tiene ahora un solo titular registrado: la persona que conserva el control de la cuenta, el cobro y el plan. En ' || replace(replace(t."nombre", '<', '&lt;'), '>', '&gt;') || ' quedó como titular quien creó la banda (o la cuenta más antigua). Vos pasaste a gestor: seguís gestionando todo, menos la plata y el equipo.</p><p>Si tiene que ser al revés, la persona titular te pasa la titularidad desde Equipo, en el panel de la banda.</p>'
            END || '</div>',
       'Hola, ' || u."nombre" || E':\n\n'
         || CASE WHEN x.orden = 1
              THEN 'En Deoco cada banda tiene ahora un solo titular registrado: la persona que conserva el control de la cuenta, el cobro y el plan. En ' || t."nombre" || E' sos vos. Las demás personas que eran titulares pasaron a gestor: siguen gestionando todo, menos la plata y el equipo.\n\nSi querés pasarle la titularidad a otra persona, lo hacés desde Equipo, en el panel de la banda.'
              ELSE 'En Deoco cada banda tiene ahora un solo titular registrado: la persona que conserva el control de la cuenta, el cobro y el plan. En ' || t."nombre" || E' quedó como titular quien creó la banda (o la cuenta más antigua). Vos pasaste a gestor: seguís gestionando todo, menos la plata y el equipo.\n\nSi tiene que ser al revés, la persona titular te pasa la titularidad desde Equipo, en el panel de la banda.'
            END,
       'titular-unico:' || x."usuarioId"
FROM titular_migrado x
JOIN "usuario" u ON u."id" = x."usuarioId"
JOIN "tenant" t ON t."id" = x."tenantId"
ON CONFLICT DO NOTHING;

-- Desde ahora la base no deja dos titulares en una banda (y el disparador diferido, ninguno).
-- Transferir = bajar al titular y subir al otro, en ese orden, en una transacción.
CREATE UNIQUE INDEX "membresia_un_titular" ON "membresia" ("tenantId") WHERE "rol" = 'TITULAR';
DROP TABLE titular_migrado;
