-- AlterTable
ALTER TABLE "ExportTask" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "workerId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exportTaskId" TEXT NOT NULL,
    "destination" TEXT NOT NULL DEFAULT 'drive',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bytesTransferred" BIGINT NOT NULL DEFAULT 0,
    "totalBytes" BIGINT,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryTask_userId_idx" ON "DeliveryTask"("userId");

-- CreateIndex
CREATE INDEX "DeliveryTask_status_createdAt_idx" ON "DeliveryTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExportTask_status_createdAt_idx" ON "ExportTask"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryTask" ADD CONSTRAINT "DeliveryTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTask" ADD CONSTRAINT "DeliveryTask_exportTaskId_fkey" FOREIGN KEY ("exportTaskId") REFERENCES "ExportTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
