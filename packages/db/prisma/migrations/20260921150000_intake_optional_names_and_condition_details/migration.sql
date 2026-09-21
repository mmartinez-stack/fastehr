-- AlterTable
ALTER TABLE "patient_conditions" ADD COLUMN     "details" TEXT;

-- AlterTable
ALTER TABLE "intake_requests" ALTER COLUMN "firstName" DROP NOT NULL,
ALTER COLUMN "lastName" DROP NOT NULL;

