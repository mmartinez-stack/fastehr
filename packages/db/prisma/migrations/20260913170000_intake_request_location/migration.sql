-- ADR 32: the clinic an intake submission waits in, derived from the office
-- the person chose. Backfilled for submissions already on record.

-- AlterTable
ALTER TABLE "intake_requests" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "intake_requests_status_locationId_idx" ON "intake_requests"("status", "locationId");

-- AddForeignKey
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "intake_requests" AS r SET "locationId" = l."slug"
FROM "locations" AS l WHERE r."office" = l."legacyName";
