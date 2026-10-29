CREATE TABLE "org_departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_departments_name_key" ON "org_departments"("name");

INSERT INTO "org_departments" ("id", "name", "sortOrder", "createdAt")
SELECT
  concat('d', substr(md5(trim(u) || random()::text), 1, 24)),
  trim(u),
  0,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "requesterUnit" AS u
  FROM "internal_requests"
  WHERE "requesterUnit" IS NOT NULL AND length(trim("requesterUnit")) > 0
) t
ON CONFLICT ("name") DO NOTHING;
