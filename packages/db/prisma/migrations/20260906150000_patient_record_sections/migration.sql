-- DIA-52: the patient record splits into sections.
--
-- Hand-written rather than generated: `prisma migrate diff` renders a column
-- rename as DROP + ADD, which would discard every migrated history note. The
-- RENAME below keeps the legacy `hx` text as the new "Other" history field.

-- AlterTable: healthy weight goes (nothing read it), history is renamed.
ALTER TABLE "patients" DROP COLUMN "healthyWeight";
ALTER TABLE "patients" RENAME COLUMN "historyNotes" TO "historyOther";
ALTER TABLE "patients" ADD COLUMN     "pcpAddress" TEXT,
ADD COLUMN     "pcpName" TEXT,
ADD COLUMN     "pcpPhone" TEXT;

-- CreateTable
CREATE TABLE "patient_medications" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_allergies" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reaction" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "patient_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_conditions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "onset" TEXT,
    "treatedBy" TEXT,
    "medicated" BOOLEAN NOT NULL DEFAULT false,
    "medications" TEXT,

    CONSTRAINT "patient_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_medications_patientId_position_idx" ON "patient_medications"("patientId", "position");

-- CreateIndex
CREATE INDEX "patient_allergies_patientId_position_idx" ON "patient_allergies"("patientId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "patient_conditions_patientId_condition_key" ON "patient_conditions"("patientId", "condition");

-- AddForeignKey
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
