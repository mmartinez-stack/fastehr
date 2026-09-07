-- CreateEnum
CREATE TYPE "intake_status" AS ENUM ('sent', 'submitted', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "intake_requests" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "language" "patient_language",
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "intake_status" NOT NULL DEFAULT 'sent',
    "office" TEXT,
    "submission" JSONB,
    "submittedAt" TIMESTAMP(3),
    "patientId" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_requests_tokenHash_key" ON "intake_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "intake_requests_status_office_idx" ON "intake_requests"("status", "office");

-- AddForeignKey
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

