-- ADR 33: the wait queue is a status on the visit. Imported history never
-- waited here: a signed note is closed, an unsigned one is in progress
-- (the legacy "unsigned" queue), and neither enters the wait queue.

-- CreateEnum
CREATE TYPE "visit_status" AS ENUM ('scheduled', 'arrived', 'roomed', 'in_progress', 'closed');

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "roomedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "visit_status" NOT NULL DEFAULT 'scheduled';

-- CreateIndex
CREATE INDEX "visits_locationId_status_arrivedAt_idx" ON "visits"("locationId", "status", "arrivedAt");

-- CreateIndex
CREATE INDEX "visits_patientId_status_idx" ON "visits"("patientId", "status");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


UPDATE "visits" SET "status" = 'closed' WHERE "signedAt" IS NOT NULL;
UPDATE "visits" SET "status" = 'in_progress', "startedAt" = "dateOfService" WHERE "signedAt" IS NULL;
