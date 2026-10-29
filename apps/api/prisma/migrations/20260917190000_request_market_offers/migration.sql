-- Talep bazlı online piyasa sütunu (gerçek cari / Vendor yok)

CREATE TABLE IF NOT EXISTS "request_market_sources" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "request_market_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "request_market_quotes" (
    "id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "request_market_quotes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "marketSourceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "request_market_quotes_sourceId_itemId_key"
    ON "request_market_quotes"("sourceId", "itemId");

CREATE INDEX IF NOT EXISTS "request_market_quotes_itemId_idx"
    ON "request_market_quotes"("itemId");

CREATE INDEX IF NOT EXISTS "request_market_sources_requestId_idx"
    ON "request_market_sources"("requestId");

CREATE INDEX IF NOT EXISTS "attachments_marketSourceId_idx"
    ON "attachments"("marketSourceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_market_sources_requestId_fkey'
  ) THEN
    ALTER TABLE "request_market_sources"
      ADD CONSTRAINT "request_market_sources_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_market_sources_createdById_fkey'
  ) THEN
    ALTER TABLE "request_market_sources"
      ADD CONSTRAINT "request_market_sources_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_market_quotes_sourceId_fkey'
  ) THEN
    ALTER TABLE "request_market_quotes"
      ADD CONSTRAINT "request_market_quotes_sourceId_fkey"
      FOREIGN KEY ("sourceId") REFERENCES "request_market_sources"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_market_quotes_itemId_fkey'
  ) THEN
    ALTER TABLE "request_market_quotes"
      ADD CONSTRAINT "request_market_quotes_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "request_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_marketSourceId_fkey'
  ) THEN
    ALTER TABLE "attachments"
      ADD CONSTRAINT "attachments_marketSourceId_fkey"
      FOREIGN KEY ("marketSourceId") REFERENCES "request_market_sources"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
