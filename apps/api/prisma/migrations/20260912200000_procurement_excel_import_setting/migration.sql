-- "Excel ile toplu kalem" kartının modül bazında görünürlüğü
CREATE TABLE IF NOT EXISTS "procurement_excel_import_settings" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_excel_import_settings_pkey" PRIMARY KEY ("id")
);
