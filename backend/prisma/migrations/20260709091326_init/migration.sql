-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "planExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MascotSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "mascotName" TEXT NOT NULL DEFAULT 'Triko',
    "sizeDesktop" INTEGER NOT NULL DEFAULT 68,
    "sizeMobile" INTEGER NOT NULL DEFAULT 52,
    "proactiveDelayMs" INTEGER NOT NULL DEFAULT 6000,
    "proactiveIntervalMs" INTEGER NOT NULL DEFAULT 50000,
    "proximityThresholdPx" INTEGER NOT NULL DEFAULT 150,
    "maxDailyShows" INTEGER NOT NULL DEFAULT 12,
    "mobileEnabled" BOOLEAN NOT NULL DEFAULT true,
    "noGoSelectors" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MascotSettings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Combo" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Combo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "comboId" TEXT,
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "deviceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsEvent_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_token_key" ON "Customer"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MascotSettings_customerId_key" ON "MascotSettings"("customerId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_customerId_createdAt_idx" ON "AnalyticsEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_comboId_eventType_idx" ON "AnalyticsEvent"("comboId", "eventType");
