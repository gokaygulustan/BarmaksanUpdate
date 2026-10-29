-- Karar daveti e-postası gecikmeli gönderilir; null iken henüz posta kutusuna düşmemiştir.
ALTER TABLE "procurement_decision_invites" ADD COLUMN "emailSentAt" TIMESTAMP(3);

-- Mevcut kayıtlar için (eski davranış: oluşturulunca mail gitmiş kabulü)
UPDATE "procurement_decision_invites"
SET "emailSentAt" = "createdAt"
WHERE "emailSentAt" IS NULL;
