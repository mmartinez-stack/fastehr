-- CreateEnum
CREATE TYPE "patient_gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "patient_language" AS ENUM ('english', 'spanish');

-- CreateEnum
CREATE TYPE "patient_status" AS ENUM ('active', 'inactive');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "gender" "patient_gender",
ADD COLUMN     "healthyWeight" DOUBLE PRECISION,
ADD COLUMN     "heightInches" DOUBLE PRECISION,
ADD COLUMN     "historyNotes" TEXT,
ADD COLUMN     "language" "patient_language",
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "office" TEXT,
ADD COLUMN     "phoneFollowUpAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "programType" TEXT,
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "referredByPatientId" TEXT,
ADD COLUMN     "status" "patient_status" NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "patients_legacyId_key" ON "patients"("legacyId");

-- CreateIndex
CREATE INDEX "patients_lastName_firstName_dateOfBirth_idx" ON "patients"("lastName", "firstName", "dateOfBirth");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_referredByPatientId_fkey" FOREIGN KEY ("referredByPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
