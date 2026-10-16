-- Los índices de migraciones del bloque D, con el nombre que les pone Prisma (sin esto, el
-- próximo `prisma migrate dev` los renombraría en una migración sorpresa).
ALTER INDEX "consentimiento_cookies_tenantId_visitante_idx" RENAME TO "consentimiento_cookies_tenantId_visitante_creadoEn_idx";
ALTER INDEX "limite_extra_origen_key" RENAME TO "limite_extra_tenantId_origen_key";
ALTER INDEX "sesion_soporte_tenantId_staffId_idx" RENAME TO "sesion_soporte_tenantId_staffId_venceEn_idx";
