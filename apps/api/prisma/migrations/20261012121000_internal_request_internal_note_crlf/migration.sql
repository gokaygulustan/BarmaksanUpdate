UPDATE "internal_requests"
SET "internalNote" = btrim(substr("description", strpos("description", E'\r\n\r\nİç not: ') + 12)),
    "description" = NULLIF(btrim(left("description", strpos("description", E'\r\n\r\nİç not: ') - 1)), '')
WHERE "internalNote" IS NULL
  AND strpos("description", E'\r\n\r\nİç not: ') > 0;
