-- AlterTable
ALTER TABLE "users" ADD COLUMN     "medicalDirector" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "reviewComments" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "sampleRunId" TEXT,
ADD COLUMN     "sampledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "review_sample_runs" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "sampledCount" INTEGER NOT NULL,
    "rate" INTEGER NOT NULL,
    "triggeredById" TEXT,

    CONSTRAINT "review_sample_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_sample_runs_windowEnd_idx" ON "review_sample_runs"("windowEnd");

-- CreateIndex
CREATE INDEX "visits_sampledAt_reviewedAt_idx" ON "visits"("sampledAt", "reviewedAt");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_sampleRunId_fkey" FOREIGN KEY ("sampleRunId") REFERENCES "review_sample_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sample_runs" ADD CONSTRAINT "review_sample_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

