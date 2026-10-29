-- Tedarikçi kartı: ne sattığı, notu, ek numaraları ve içe aktarma izi
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "extraContactPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "importSource" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3);

-- Firmadaki yetkili kişiler
CREATE TABLE IF NOT EXISTS "vendor_contacts" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "name" TEXT,
  "title" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vendor_contacts_vendorId_idx" ON "vendor_contacts"("vendorId");

DO $$ BEGIN
  ALTER TABLE "vendor_contacts"
    ADD CONSTRAINT "vendor_contacts_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
