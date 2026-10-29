-- Teklif bildirimi e-postasında CC olarak kullanılabilecek yönetici adresleri (yalnız ADMIN düzenler)
CREATE TABLE "procurement_notification_cc_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_notification_cc_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurement_notification_cc_contacts_email_key" ON "procurement_notification_cc_contacts"("email");
