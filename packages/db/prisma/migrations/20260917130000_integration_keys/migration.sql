-- ADR 36, ADR 38: the integration role, Better Auth's api key table, patient
-- verification tokens, and the attempt counter behind the lockout. Plus the
-- phone index the lookup needs.

-- AlterEnum
ALTER TYPE "staff_role" ADD VALUE 'integration';

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitTimeWindow" INTEGER,
    "rateLimitMax" INTEGER,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_verifications" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_verification_attempts" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_keys_configId_idx" ON "api_keys"("configId");

-- CreateIndex
CREATE INDEX "api_keys_referenceId_idx" ON "api_keys"("referenceId");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "patient_verifications_tokenHash_key" ON "patient_verifications"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_verifications_integrationId_patientId_expiresAt_idx" ON "patient_verifications"("integrationId", "patientId", "expiresAt");

-- CreateIndex
CREATE INDEX "patient_verification_attempts_integrationId_patientId_occur_idx" ON "patient_verification_attempts"("integrationId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "patient_verification_attempts_integrationId_occurredAt_idx" ON "patient_verification_attempts"("integrationId", "occurredAt");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_verifications" ADD CONSTRAINT "patient_verifications_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_verifications" ADD CONSTRAINT "patient_verifications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_verification_attempts" ADD CONSTRAINT "patient_verification_attempts_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
