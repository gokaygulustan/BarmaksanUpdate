CREATE TABLE IF NOT EXISTS "procurement_projects" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL DEFAULT 'URETIM_PLANLAMA',
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "procurement_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "procurement_projects_moduleId_code_key" ON "procurement_projects"("moduleId", "code");
CREATE INDEX IF NOT EXISTS "procurement_projects_moduleId_isActive_idx" ON "procurement_projects"("moduleId", "isActive");

ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
CREATE INDEX IF NOT EXISTS "procurement_requests_projectId_idx" ON "procurement_requests"("projectId");
ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "procurement_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Üretimin varsayılan projesi; projesi seçilmemiş tüm üretim talepleri buraya bağlanır.
INSERT INTO "procurement_projects" ("id", "moduleId", "code", "name", "isDefault", "isActive", "updatedAt")
VALUES ('proj_uretim_genel', 'URETIM_PLANLAMA', NULL, 'Genel', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "procurement_requests"
SET "projectId" = 'proj_uretim_genel'
WHERE "moduleId" = 'URETIM_PLANLAMA' AND "projectId" IS NULL;
