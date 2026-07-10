-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "imageUrl" TEXT,
    "rawCategory" TEXT,
    "category" TEXT,
    "color" TEXT,
    "styleTags" TEXT NOT NULL DEFAULT '[]',
    "season" TEXT,
    "enriched" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'crawl',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_customerId_status_idx" ON "Product"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_customerId_externalId_key" ON "Product"("customerId", "externalId");

-- CreateIndex
CREATE INDEX "AgentEvent_customerId_createdAt_idx" ON "AgentEvent"("customerId", "createdAt");
