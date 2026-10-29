-- CreateTable
CREATE TABLE "mail_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "user" TEXT,
    "pass" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);
