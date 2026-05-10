CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "exportTaskId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "taxonomyId" TEXT,
  "tags" JSONB,
  "coverItems" JSONB,
  "gumroadProductId" TEXT,
  "gumroadFileUrl" TEXT,
  "gumroadShortUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "errorMsg" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Product_userId_idx" ON "Product"("userId");
CREATE INDEX IF NOT EXISTS "Product_storeId_idx" ON "Product"("storeId");
CREATE INDEX IF NOT EXISTS "Product_exportTaskId_idx" ON "Product"("exportTaskId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryTask"
  ADD COLUMN IF NOT EXISTS "productId" TEXT,
  ADD COLUMN IF NOT EXISTS "phase" TEXT;

ALTER TABLE "DeliveryTask"
  ADD CONSTRAINT "DeliveryTask_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
