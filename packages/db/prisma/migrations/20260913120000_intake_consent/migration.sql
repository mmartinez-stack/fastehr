-- AlterTable
ALTER TABLE "intake_requests" ADD COLUMN     "consentLanguage" "patient_language",
ADD COLUMN     "consentSignature" TEXT,
ADD COLUMN     "consentSignedAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT;

