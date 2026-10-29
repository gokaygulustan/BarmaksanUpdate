ALTER TABLE "notifications" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ALERT';

UPDATE "notifications"
SET "kind" = 'MESSAGE'
WHERE "message" = 'Yeni mesajınız var';

CREATE INDEX "notifications_userId_kind_isRead_idx" ON "notifications"("userId", "kind", "isRead");
