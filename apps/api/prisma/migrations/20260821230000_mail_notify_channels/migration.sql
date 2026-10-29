-- Kanal bazlı e-posta bildirim anahtarları (eski global bayraktan kopyalanır)
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyVendorQuote" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyQuoteReceived" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyApproval" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyWarehouse" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyDepartment" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notifyChat" BOOLEAN NOT NULL DEFAULT true;

UPDATE "mail_settings"
SET
  "notifyVendorQuote" = COALESCE("notificationsEnabled", true),
  "notifyQuoteReceived" = COALESCE("notificationsEnabled", true),
  "notifyApproval" = COALESCE("notificationsEnabled", true),
  "notifyWarehouse" = COALESCE("notificationsEnabled", true),
  "notifyDepartment" = COALESCE("notificationsEnabled", true),
  "notifyChat" = COALESCE("notificationsEnabled", true);
