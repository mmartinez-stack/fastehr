-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "lastVisitAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dateOfService" TIMESTAMP(3) NOT NULL,
    "office" TEXT,
    "notes" TEXT,
    "signedById" TEXT,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_legacyId_key" ON "visits"("legacyId");

-- CreateIndex
CREATE INDEX "visits_patientId_dateOfService_idx" ON "visits"("patientId", "dateOfService");

-- CreateIndex
CREATE INDEX "visits_signedAt_idx" ON "visits"("signedAt");

-- CreateIndex
CREATE INDEX "patients_lastVisitAt_idx" ON "patients"("lastVisitAt");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

