-- Bildirim e-postalarını admin ayarından aç/kapa

ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
