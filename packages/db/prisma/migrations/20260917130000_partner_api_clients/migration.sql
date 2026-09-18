-- ADR 36: partner API clients, patient verification tokens, and the attempt
-- counter behind the lockout. Plus the phone index the lookup needs.


-- CreateEnum
CREATE TYPE "api_client_status" AS ENUM ('active', 'revoked');

-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "environment" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "allowedIps" TEXT[],
    "locationIds" TEXT[],
    "status" "api_client_status" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "baaSignedAt" DATE,
    "issuedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_verifications" (
    "id" TEXT NOT NULL,
    "apiClientId" TEXT NOT NULL,
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
    "apiClientId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyId_key" ON "api_clients"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyHash_key" ON "api_clients"("keyHash");

-- CreateIndex
CREATE INDEX "api_clients_status_idx" ON "api_clients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_verifications_tokenHash_key" ON "patient_verifications"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_verifications_apiClientId_patientId_expiresAt_idx" ON "patient_verifications"("apiClientId", "patientId", "expiresAt");

-- CreateIndex
CREATE INDEX "patient_verification_attempts_apiClientId_patientId_occurre_idx" ON "patient_verification_attempts"("apiClientId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "patient_verification_attempts_apiClientId_occurredAt_idx" ON "patient_verification_attempts"("apiClientId", "occurredAt");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- AddForeignKey
ALTER TABLE "patient_verifications" ADD CONSTRAINT "patient_verifications_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_verifications" ADD CONSTRAINT "patient_verifications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_verification_attempts" ADD CONSTRAINT "patient_verification_attempts_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

