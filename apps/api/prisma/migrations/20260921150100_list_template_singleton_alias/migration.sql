-- Canlıdaki eski API hâlâ id=singleton bekler; üretim şablonu kaybolmasın.
INSERT INTO "procurement_list_templates" ("id", "originalName", "storedPath", "mimeType", "size", "updatedAt", "createdAt")
SELECT 'singleton', "originalName", "storedPath", "mimeType", "size", "updatedAt", "createdAt"
FROM "procurement_list_templates"
WHERE "id" = 'URETIM_PLANLAMA'
  AND NOT EXISTS (
    SELECT 1 FROM "procurement_list_templates" WHERE "id" = 'singleton'
  );
