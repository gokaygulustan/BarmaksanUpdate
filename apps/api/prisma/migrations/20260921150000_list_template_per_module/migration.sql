-- Eski tek şablon (Kerem / üretim) kaybolmasın.
UPDATE "procurement_list_templates"
SET "id" = 'URETIM_PLANLAMA'
WHERE "id" = 'singleton';
