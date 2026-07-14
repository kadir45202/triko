-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "state" TEXT NOT NULL DEFAULT 'running',
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "productsFound" INTEGER NOT NULL DEFAULT 0,
    "productsNew" INTEGER NOT NULL DEFAULT 0,
    "productsRemoved" INTEGER NOT NULL DEFAULT 0,
    "combosCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ScanRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Combo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "triggerUrlPattern" TEXT NOT NULL,
    "triggerProductId" TEXT,
    "suggestedProductName" TEXT NOT NULL,
    "suggestedProductPrice" TEXT NOT NULL,
    "suggestedProductUrl" TEXT NOT NULL,
    "suggestedProductImageOriginal" TEXT,
    "suggestedProductImageProcessed" TEXT,
    "mascotText" TEXT NOT NULL,
    "socialProof" TEXT,
    "expertNote" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'published',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Combo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Combo" ("createdAt", "customerId", "expertNote", "id", "isActive", "mascotText", "priority", "socialProof", "suggestedProductImageOriginal", "suggestedProductImageProcessed", "suggestedProductName", "suggestedProductPrice", "suggestedProductUrl", "triggerProductId", "triggerUrlPattern", "updatedAt") SELECT "createdAt", "customerId", "expertNote", "id", "isActive", "mascotText", "priority", "socialProof", "suggestedProductImageOriginal", "suggestedProductImageProcessed", "suggestedProductName", "suggestedProductPrice", "suggestedProductUrl", "triggerProductId", "triggerUrlPattern", "updatedAt" FROM "Combo";
DROP TABLE "Combo";
ALTER TABLE "new_Combo" RENAME TO "Combo";
CREATE INDEX "Combo_customerId_status_idx" ON "Combo"("customerId", "status");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "planExpiresAt" DATETIME,
    "allowedDomains" TEXT NOT NULL DEFAULT '[]',
    "siteUrl" TEXT,
    "autoPublishCombos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("allowedDomains", "companyName", "createdAt", "email", "id", "passwordHash", "plan", "planExpiresAt", "siteUrl", "token") SELECT "allowedDomains", "companyName", "createdAt", "email", "id", "passwordHash", "plan", "planExpiresAt", "siteUrl", "token" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "Customer_token_key" ON "Customer"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScanRun_customerId_startedAt_idx" ON "ScanRun"("customerId", "startedAt");
