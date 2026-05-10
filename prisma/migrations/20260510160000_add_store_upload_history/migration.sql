CREATE TABLE IF NOT EXISTS "StoreUploadHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "productId" TEXT,
  "exportTaskId" TEXT,
  "platform" TEXT NOT NULL,
  "title" TEXT,
  "status" TEXT NOT NULL,
  "externalId" TEXT,
  "targetUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoreUploadHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoreUploadHistory_userId_createdAt_idx"
  ON "StoreUploadHistory"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "StoreUploadHistory_storeId_idx"
  ON "StoreUploadHistory"("storeId");
CREATE INDEX IF NOT EXISTS "StoreUploadHistory_productId_idx"
  ON "StoreUploadHistory"("productId");

ALTER TABLE "StoreUploadHistory"
  ADD CONSTRAINT "StoreUploadHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreUploadHistory"
  ADD CONSTRAINT "StoreUploadHistory_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreUploadHistory"
  ADD CONSTRAINT "StoreUploadHistory_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
