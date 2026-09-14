-- CreateEnum
CREATE TYPE "visit_modality" AS ENUM ('in_person', 'telemedicine', 'at_home');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "modality" "visit_modality" NOT NULL DEFAULT 'in_person';

-- CreateTable
CREATE TABLE "locations" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legacyName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_legacyName_key" ON "locations"("legacyName");

-- CreateIndex
CREATE INDEX "patients_locationId_idx" ON "patients"("locationId");

-- CreateIndex
CREATE INDEX "visits_locationId_dateOfService_idx" ON "visits"("locationId", "dateOfService");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ADR 32: seed the clinics. Two active, Montebello kept inactive for its
-- history. `legacyName` is the office string the legacy system wrote.
INSERT INTO "locations" ("slug", "name", "legacyName", "active", "sortOrder", "updatedAt") VALUES
  ('sylmar',     'Sylmar',     'Sylmar',      true,  1, CURRENT_TIMESTAMP),
  ('kanoga',     'Kanoga',     'PennProgram', true,  2, CURRENT_TIMESTAMP),
  ('montebello', 'Montebello', 'Montebello',  false, 3, CURRENT_TIMESTAMP);

-- Backfill: a patient or visit whose office is a clinic points at it.
UPDATE "patients" AS p SET "locationId" = l."slug"
FROM "locations" AS l WHERE p."office" = l."legacyName";

UPDATE "visits" AS v SET "locationId" = l."slug"
FROM "locations" AS l WHERE v."office" = l."legacyName";

-- The legacy pseudo-offices become the modality.
UPDATE "visits" SET "modality" = 'telemedicine' WHERE "office" = 'Telemedicine';
UPDATE "visits" SET "modality" = 'at_home'      WHERE "office" = 'At Home';

-- A remote visit is attributed to its patient's clinic. What remains NULL
-- is a remote visit of a patient with no clinic, or a dead office value:
-- "no clinic on record", never folded into one.
UPDATE "visits" AS v SET "locationId" = p."locationId"
FROM "patients" AS p
WHERE v."patientId" = p."id"
  AND v."locationId" IS NULL
  AND v."office" IN ('Telemedicine', 'At Home')
  AND p."locationId" IS NOT NULL;
